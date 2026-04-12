"""
backend/preprocessing/predictor.py
Assemble the full 71-barangay feature matrix and run XGBoost inference.
"""

import logging
import pandas as pd
from xgboost import XGBClassifier

from preprocessing.startup import MODEL_FEATURE_COLUMNS
from ecmwf.ecmwf import RainfallForecast, validate_rainfall_units

logger = logging.getLogger(__name__)

# Dynamic rainfall features (broadcast across all 71 rows)
RAIN_FEATURES = ["rain_1hr", "rain_3hr", "rain_6hr"]

# Full feature list: 16 static + 3 dynamic = 19
ALL_FEATURES = MODEL_FEATURE_COLUMNS + RAIN_FEATURES


def build_feature_matrix(
    static_df: pd.DataFrame,
    forecast: RainfallForecast,
) -> pd.DataFrame:
    """
    Broadcast the three scalar rainfall values across all 71 barangay rows.
    Returns a (71 x 19) DataFrame with columns in ALL_FEATURES order.

    Parameters
    ----------
    static_df : 71-row DataFrame from preprocessing/startup.py
    forecast  : RainfallForecast — rain values already in mm
    """
    validate_rainfall_units(forecast.rain_1hr, "rain_1hr")
    validate_rainfall_units(forecast.rain_3hr, "rain_3hr")
    validate_rainfall_units(forecast.rain_6hr, "rain_6hr")

    X = static_df[MODEL_FEATURE_COLUMNS].copy()
    X["rain_1hr"] = forecast.rain_1hr
    X["rain_3hr"] = forecast.rain_3hr
    X["rain_6hr"] = forecast.rain_6hr

    return X[ALL_FEATURES]


def run_prediction(
    model: XGBClassifier,
    static_df: pd.DataFrame,
    forecast: RainfallForecast,
) -> dict:
    """
    Run flood probability prediction for all 71 barangays simultaneously.
    Called by GET /predict and GET /predict/window/{hours} in backend/main.py.

    Returns a dict ready to be serialised as JSON.
    """
    X = build_feature_matrix(static_df, forecast)
    logger.info(f"Feature matrix shape: {X.shape}")

    # predict_proba[:, 1] = P(flood = 1)
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