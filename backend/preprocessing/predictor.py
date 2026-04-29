"""
predictor.py — per-point flood prediction pipeline.

Flow:
  1. engineer_features()       -> 25-column feature matrix
  2. rainfall gate             -> skip XGBoost if rain too low
  3. XGBoost inference         -> raw probabilities per point
  4. apply_rainfall_scaling()  -> smooth cliff-edge at training minimum
  5. get_dynamic_thresholds()  -> label boundaries shift with rainfall
  6. classify_points()         -> Low/Moderate/High/Critical per point
  7. _points_to_geojson()      -> GeoJSON FeatureCollection
  8. _aggregate_to_barangays() -> average probability per barangay
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import pandas as pd
import xgboost as xgb

from ecmwf.ecmwf import RainfallForecast

logger = logging.getLogger(__name__)

RAIN_GATE_1H  = 0.5
RAIN_GATE_72H = 5.0


def get_rainfall_scale_factor(rain_1h: float) -> float:
    if rain_1h < 0.556:  return 0.0
    elif rain_1h < 2.0:  return 0.25
    elif rain_1h < 4.0:  return 0.40
    elif rain_1h < 8.0:  return 0.60
    elif rain_1h < 15.0: return 0.75
    elif rain_1h < 25.0: return 0.90
    else:                return 1.0


def apply_rainfall_scaling(proba: np.ndarray, rain_1h: float) -> np.ndarray:
    return proba * get_rainfall_scale_factor(rain_1h)


def get_dynamic_thresholds(rain_1h: float) -> dict[str, float]:
    if rain_1h < 2.0:
        return {"low": 0.20, "moderate": 0.45, "high": 0.70}
    elif rain_1h < 8.0:
        return {"low": 0.15, "moderate": 0.35, "high": 0.60}
    elif rain_1h < 20.0:
        return {"low": 0.10, "moderate": 0.25, "high": 0.50}
    else:
        return {"low": 0.08, "moderate": 0.20, "high": 0.40}


def engineer_features(
    static_df: pd.DataFrame,
    forecast: RainfallForecast,
    model: xgb.Booster,
) -> pd.DataFrame:
    df = static_df.copy()
    df["elev_1"]    = np.sqrt(df["elev_1"].clip(lower=0))
    df["slope_1"]   = np.log1p(df["slope_1"].clip(lower=0))
    df["flowacc_1"] = np.log1p(df["flowacc_1"].clip(lower=0))
    df["flood_proximity_index"] = df["twi_1"] / (df["distriver_1"] + 1)
    df["rain_1h"]  = forecast.rain_1hr
    df["rain_72h"] = forecast.rain_72h_prior

    feature_names = model.feature_names
    missing = [f for f in feature_names if f not in df.columns]
    if missing:
        logger.warning("Missing feature columns: %s — filling with 0", missing)
        for col in missing:
            df[col] = 0.0
    return df[feature_names]


def classify_points(proba: np.ndarray, thresholds: dict[str, float]) -> list[str]:
    labels = []
    for p in proba:
        if p >= thresholds["high"]:      labels.append("Critical")
        elif p >= thresholds["moderate"]: labels.append("High")
        elif p >= thresholds["low"]:      labels.append("Moderate")
        else:                             labels.append("Low")
    return labels


def _dry_geojson(static_df: pd.DataFrame) -> dict:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [row["lon"], row["lat"]]},
                "properties": {"point_id": int(row["point_id"]),
                               "flood_probability": 0.0, "flood_label": "Low"},
            }
            for _, row in static_df[["point_id", "lon", "lat"]].iterrows()
        ],
    }


def _points_to_geojson(static_df: pd.DataFrame, proba: np.ndarray, labels: list[str]) -> dict:
    features = []
    for i, (_, row) in enumerate(static_df[["point_id", "lon", "lat"]].iterrows()):
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [row["lon"], row["lat"]]},
            "properties": {
                "point_id": int(row["point_id"]),
                "flood_probability": round(float(proba[i]), 4),
                "flood_label": labels[i],
            },
        })
    return {"type": "FeatureCollection", "features": features}


def _aggregate_to_barangays(
    static_df: pd.DataFrame,
    proba: np.ndarray,
    barangay_lookup: pd.DataFrame,
    thresholds: dict[str, float],
) -> list[dict]:
    prob_series = pd.Series(proba, index=static_df["point_id"].values, name="flood_probability")
    lookup = barangay_lookup.dropna(subset=["barangay"]).copy()
    lookup["flood_probability"] = lookup["point_id"].map(prob_series)

    grouped = (
        lookup.groupby("barangay")["flood_probability"]
        .agg(avg_probability="mean", point_count="count")
        .reset_index()
    )
    grouped["avg_probability"] = grouped["avg_probability"].round(4)

    def _label(p: float) -> str:
        if p >= thresholds["high"]:      return "Critical"
        elif p >= thresholds["moderate"]: return "High"
        elif p >= thresholds["low"]:      return "Moderate"
        return "Low"

    grouped["flood_label"] = grouped["avg_probability"].apply(_label)
    return grouped.rename(columns={"avg_probability": "flood_probability"}).to_dict(orient="records")


def run_prediction(
    model: xgb.Booster,
    static_df: pd.DataFrame,
    forecast: RainfallForecast,
    barangay_lookup: Optional[pd.DataFrame] = None,
) -> dict:
    rain_1h  = forecast.rain_1hr
    rain_72h = forecast.rain_72h_prior

    dry_run = rain_1h < RAIN_GATE_1H and rain_72h < RAIN_GATE_72H
    if dry_run:
        logger.info("Rainfall gate: rain_1h=%.3f, rain_72h=%.1f -> dry run.", rain_1h, rain_72h)
        bgy_results: list[dict] = []
        if barangay_lookup is not None:
            bgy_results = (
                barangay_lookup.dropna(subset=["barangay"])
                .groupby("barangay")["point_id"].count()
                .reset_index(name="point_count")
                .assign(flood_probability=0.0, flood_label="Low")
                .to_dict(orient="records")
            )
        return {
            "points_geojson": _dry_geojson(static_df),
            "barangay_results": bgy_results,
            "metadata": {
                "rain_1hr_mm":    rain_1h,
                "rain_3hr_mm":    forecast.rain_3hr,
                "rain_6hr_mm":    forecast.rain_6hr,
                "rain_72h_prior": rain_72h,
                "is_fallback":    forecast.is_fallback,
                "point_count":    len(static_df),
                "dry_run":        True,
                "scale_factor":   0.0,
            },
        }

    X_df    = engineer_features(static_df, forecast, model)
    dmatrix = xgb.DMatrix(X_df.values, feature_names=list(X_df.columns))
    proba   = model.predict(dmatrix)
    proba   = apply_rainfall_scaling(proba, rain_1h)
    scale_factor = get_rainfall_scale_factor(rain_1h)

    thresholds = get_dynamic_thresholds(rain_1h)
    labels     = classify_points(proba, thresholds)

    pts_geojson = _points_to_geojson(static_df, proba, labels)
    bgy_results = []
    if barangay_lookup is not None:
        bgy_results = _aggregate_to_barangays(static_df, proba, barangay_lookup, thresholds)

    high_count     = sum(1 for l in labels if l in ("High", "Critical"))
    critical_count = sum(1 for l in labels if l == "Critical")
    logger.info("Prediction done: %d points, scale=%.2f, high=%d, critical=%d",
                len(static_df), scale_factor, high_count, critical_count)

    return {
        "points_geojson": pts_geojson,
        "barangay_results": bgy_results,
        "metadata": {
            "rain_1hr_mm":    rain_1h,
            "rain_3hr_mm":    forecast.rain_3hr,
            "rain_6hr_mm":    forecast.rain_6hr,
            "rain_72h_prior": rain_72h,
            "is_fallback":    forecast.is_fallback,
            "point_count":    len(static_df),
            "dry_run":        False,
            "scale_factor":   scale_factor,
        },
    }

"""
RAINFALL GATE FIX — Add to predictor.py
========================================
Temporary fix for the cliff-edge at rain_1h = 0.556mm.

Problem:
  Model was trained with minimum non-zero rainfall = 0.556mm (LPA_Feb2023).
  Any rain >= 0.556mm triggers full terrain-based probability (up to 0.83).
  At 1mm simulation, everywhere looks Very High — not useful for presentation.

Fix — Probability scaling by rainfall intensity:
  Multiply raw XGBoost probability by a rainfall scale factor.
  This preserves spatial variation (terrain still drives WHICH points are high)
  while making probability proportional to rainfall intensity.

  Scale factors:
    0.0mm        -> 0.00  (gate — everything Very Low)
    0.556–2.0mm  -> 0.25  (only extreme terrain shows Low)
    2.0–4.0mm    -> 0.40  (low-lying areas start showing Moderate)
    4.0–8.0mm    -> 0.60  (widespread Low-Moderate)
    8.0–15.0mm   -> 0.75  (High in flood-prone zones)
    15.0–25.0mm  -> 0.90  (Very High in worst terrain)
    25.0mm+      -> 1.00  (full model output — typhoon conditions)

This is a PRESENTATION FIX only. The proper fix is retraining with
gradient rows (xgboost_training_rainfall_conditioned_v2.csv).

USAGE — add to run_prediction() in predictor.py, after XGBoost inference:

    proba = model.predict_proba(X_df.values)[:, 1]
    proba = apply_rainfall_scaling(proba, rain_1h)   # ← ADD THIS LINE
"""


def get_rainfall_scale_factor(rain_1h: float) -> float:
    """
    Returns a scale factor [0.0, 1.0] based on rainfall intensity.
    Converts the model's binary cliff at 0.556mm into a smooth gradient.
    """
    if rain_1h < 0.556:   return 0.0    # dry gate — no rainfall trigger
    elif rain_1h < 2.0:   return 0.25   # very light rain
    elif rain_1h < 4.0:   return 0.40   # light rain
    elif rain_1h < 8.0:   return 0.60   # moderate rain
    elif rain_1h < 15.0:  return 0.75   # heavy rain
    elif rain_1h < 25.0:  return 0.90   # very heavy rain
    else:                 return 1.0    # typhoon / extreme — full output


def apply_rainfall_scaling(proba: "np.ndarray", rain_1h: float) -> "np.ndarray":
    """
    Scale XGBoost probabilities by rainfall intensity factor.

    Parameters
    ----------
    proba   : np.ndarray of shape (n_points,) — raw model probabilities
    rain_1h : float — 1-hour rainfall in mm from ECMWF or simulation

    Returns
    -------
    np.ndarray of same shape — scaled probabilities
    """
 
    scale = get_rainfall_scale_factor(rain_1h)
    return proba * scale


# ── Integration point in predictor.py ────────────────────────────────────────
# Find this block in run_prediction():
#
#   proba = model.predict_proba(X_df.values)[:, 1]
#
# Replace with:
#
#   proba = model.predict_proba(X_df.values)[:, 1]
#   proba = apply_rainfall_scaling(proba, rain_1h)
#
# That's the only change needed. Everything else stays the same.
# ─────────────────────────────────────────────────────────────────────────────


# ── Simulation preset rainfall values ────────────────────────────────────────
# Update your simulation UI presets to use these values for clean demo:

SIMULATION_PRESETS = {
    "No Rain":       {"rain_1h": 0.0,  "rain_72h": 0.0,   "label": "Dry — No flood trigger"},
    "Light (C0)":    {"rain_1h": 3.0,  "rain_72h": 0.0,   "label": "Light rain — Low risk zones visible"},
    "Monsoon (C1)":  {"rain_1h": 10.0, "rain_72h": 20.0,  "label": "Monsoon — Moderate-High risk"},
    "Typhoon (C2)":  {"rain_1h": 25.0, "rain_72h": 10.0,  "label": "Typhoon — High-Very High risk"},
    "Extreme (C2)":  {"rain_1h": 40.0, "rain_72h": 5.0,   "label": "Extreme typhoon — Maximum risk"},
    "Saturated(C3)": {"rain_1h": 10.0, "rain_72h": 150.0, "label": "Saturated soil — Elevated baseline"},
}

# The current slider default of 1mm is below the useful range.
# Change the Light (C0) preset minimum to 3mm for meaningful demo output.