"""
backend/preprocessing/predictor.py
Assemble the full barangay feature matrix and run XGBoost inference.
"""

import logging
import pandas as pd
from xgboost import XGBClassifier

from ecmwf.ecmwf import RainfallForecast, validate_rainfall_units

logger = logging.getLogger(__name__)

# Exact 11 features the model was trained on, in order
MODEL_EXPECTED_FEATURES = [
    "elev_1",
    "slope_1",
    "log_flowacc",
    "geol_1",
    "lulc_1",
    "distriver_1",
    "twi_1",
    "rain_1h",
    "rain_3h",
    "rain_6h",
    "cluster_id",
]

STATIC_FEATURES = [
    "elev_1", "slope_1", "flowacc_1", "geol_1",
    "lulc_1", "distriver_1", "twi_1", "tc_cluster",
]


def build_feature_matrix(
    static_df: pd.DataFrame,
    forecast: RainfallForecast,
) -> pd.DataFrame:
    validate_rainfall_units(forecast.rain_1hr, "rain_1hr")
    validate_rainfall_units(forecast.rain_3hr, "rain_3hr")
    validate_rainfall_units(forecast.rain_6hr, "rain_6hr")

    missing = [c for c in STATIC_FEATURES if c not in static_df.columns]
    if missing:
        raise ValueError(
            f"static_df missing columns: {missing}\n"
            f"Available: {static_df.columns.tolist()}"
        )

    X = static_df[STATIC_FEATURES].copy()
    X = X.rename(columns={
        "flowacc_1":  "log_flowacc",
        "tc_cluster": "cluster_id",
    })

    X["rain_1h"] = forecast.rain_1hr
    X["rain_3h"] = forecast.rain_3hr
    X["rain_6h"] = forecast.rain_6hr

    return X[MODEL_EXPECTED_FEATURES]


def run_prediction(
    model: XGBClassifier,
    static_df: pd.DataFrame,
    forecast: RainfallForecast,
) -> dict:
    X = build_feature_matrix(static_df, forecast)
    logger.info(f"Feature matrix shape: {X.shape}")
    logger.info(f"Feature columns: {X.columns.tolist()}")

    proba = model.predict_proba(X.values)[:, 1]
    proba_rounded = [round(float(p), 4) for p in proba]
    barangays = static_df["barangay"].tolist()

    high_risk = [
        {"barangay": b, "probability": p}
        for b, p in sorted(zip(barangays, proba_rounded), key=lambda x: -x[1])
        if p >= 0.5
    ]

    logger.info(f"Prediction complete — high-risk barangays: {len(high_risk)}")

    return {
        "forecast_time": forecast.forecast_time,
        "rain_1hr_mm": forecast.rain_1hr,
        "rain_3hr_mm": forecast.rain_3hr,
        "rain_6hr_mm": forecast.rain_6hr,
        "n_barangays": len(barangays),
        "barangays": barangays,
        "flood_probability": proba_rounded,
        "high_risk": high_risk,
    }