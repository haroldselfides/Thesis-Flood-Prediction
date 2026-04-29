"""
main.py — FastAPI entry point for the flood prediction backend.

Startup loads (once):
  - XGBoost flood model  (flood_model.json)
  - Static terrain points (inference_points.csv)
  - Barangay lookup       (spatial join: point_id -> barangay)

Routes:
  GET  /health
  GET  /predict           — live forecast from ECMWF
  POST /predict           — backward-compat alias
  GET  /predict/simulate  — manual rainfall inputs, bypasses ECMWF
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Optional

import pandas as pd
import xgboost as xgb
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from ecmwf.ecmwf import RainfallForecast, fetch_rainfall
from preprocessing.predictor import run_prediction
from preprocessing.startup import build_barangay_lookup, load_single_model, load_static_features

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


class AppState:
    model: xgb.Booster
    static_df: pd.DataFrame
    barangay_lookup: Optional[pd.DataFrame]


app_state = AppState()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Loading model and static data ...")
    app_state.model           = load_single_model()
    app_state.static_df       = load_static_features()
    app_state.barangay_lookup = build_barangay_lookup(app_state.static_df)
    logger.info("Startup complete.")
    yield
    logger.info("Shutting down.")


app = FastAPI(title="Flood Prediction API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _window_to_rain(forecast: RainfallForecast, window: str) -> RainfallForecast:
    if window == "1hr":
        pass
    elif window == "3hr":
        forecast.rain_1hr = round(forecast.rain_3hr / 3.0, 3)
    elif window == "6hr":
        forecast.rain_1hr = round(forecast.rain_6hr / 6.0, 3)
    return forecast


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": app_state.model is not None,
        "points": len(app_state.static_df) if app_state.static_df is not None else 0,
        "barangay_lookup": app_state.barangay_lookup is not None,
    }


@app.get("/predict")
async def predict_get(window: str = Query("3hr", pattern="^(1hr|3hr|6hr)$")):
    try:
        forecast = fetch_rainfall()
        forecast = _window_to_rain(forecast, window)
        return run_prediction(app_state.model, app_state.static_df, forecast,
                              barangay_lookup=app_state.barangay_lookup)
    except Exception as exc:
        logger.exception("predict_get failed")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/predict")
async def predict_post(body: dict = {}):
    window = body.get("window", "3hr")
    if window not in ("1hr", "3hr", "6hr"):
        window = "3hr"
    try:
        forecast = fetch_rainfall()
        forecast = _window_to_rain(forecast, window)
        return run_prediction(app_state.model, app_state.static_df, forecast,
                              barangay_lookup=app_state.barangay_lookup)
    except Exception as exc:
        logger.exception("predict_post failed")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/predict/simulate")
async def predict_simulate(
    rain_1hr:       float = Query(0.0),
    rain_3hr:       float = Query(0.0),
    rain_6hr:       float = Query(0.0),
    rain_72h_prior: float = Query(0.0),
    window:         str   = Query("3hr", pattern="^(1hr|3hr|6hr)$"),
):
    if rain_1hr == 0.0 and rain_3hr > 0.0:
        rain_1hr = round(rain_3hr / 3.0, 3)

    forecast = RainfallForecast(
        rain_1hr=rain_1hr,
        rain_3hr=rain_3hr,
        rain_6hr=rain_6hr,
        rain_72h_prior=rain_72h_prior,
        is_fallback=False,
    )
    try:
        result = run_prediction(app_state.model, app_state.static_df, forecast,
                                barangay_lookup=app_state.barangay_lookup)
        result["metadata"]["simulated"] = True
        return result
    except Exception as exc:
        logger.exception("predict_simulate failed")
        raise HTTPException(status_code=500, detail=str(exc))
