"""
backend/main.py — Legazpi City Flood Prediction API
FastAPI + XGBoost + ECMWF Open Data
"""

from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Optional
import time
import logging

from preprocessing.startup import load_model, load_static_features
from ecmwf.ecmwf import fetch_rainfall_forecast, RainfallForecast
from preprocessing.predictor import run_prediction

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ── Lifespan: load heavy assets ONCE at startup ───────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Loading model and static features...")
    app.state.model = load_model("model/xgboost_flood_model.json")
    app.state.static_df = load_static_features(
        "preprocessing/data/legazpi_spatial_features_final_last.gpkg"
    )
    logger.info("✅ Startup complete — 71 barangays ready.")
    yield
    logger.info("🛑 Shutting down.")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Legazpi Flood Prediction API",
    description=(
        "Real-time flood probability for 71 Legazpi City barangays "
        "using ECMWF forecasts + XGBoost."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],   # Next.js dev server
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}


# ── /predict ──────────────────────────────────────────────────────────────────
@app.get("/predict", summary="Flood probability for all 71 Legazpi barangays")
async def predict(
    request: Request,
    window: Optional[str] = Query(
        default="all",
        description="Rainfall window to highlight: '1hr', '3hr', '6hr', or 'all'.",
    ),
):
    """
    Proxied by `src/app/api/predict/route.ts` on the Next.js side.

    Returns:
    - `barangays`: 71 barangay names
    - `flood_probability`: parallel P(flood) list in [0, 1]
    - `rain_1hr_mm / rain_3hr_mm / rain_6hr_mm`: ECMWF rainfall in mm
    - `forecast_time`: ISO-8601 UTC of the ECMWF model run
    - `high_risk`: barangays with P(flood) >= 0.50, sorted descending
    - `elapsed_ms`: total server-side processing time
    """
    t0 = time.perf_counter()

    forecast: RainfallForecast = await fetch_rainfall_forecast()
    result = run_prediction(
        model=request.app.state.model,
        static_df=request.app.state.static_df,
        forecast=forecast,
    )

    result["elapsed_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    if window in ("1hr", "3hr", "6hr"):
        result["active_window"] = window

    return result


# ── /predict/window/{hours} ───────────────────────────────────────────────────
@app.get(
    "/predict/window/{hours}",
    summary="Flood probability for a specific rainfall window",
)
async def predict_window(request: Request, hours: int):
    """
    Convenience route:
      GET /predict/window/1
      GET /predict/window/3
      GET /predict/window/6

    Proxied by `src/app/api/predict/route.ts`.
    Confirm with Romi whether separate models per window are needed.
    """
    if hours not in (1, 3, 6):
        raise HTTPException(status_code=400, detail="hours must be 1, 3, or 6")

    t0 = time.perf_counter()
    forecast: RainfallForecast = await fetch_rainfall_forecast()
    result = run_prediction(
        model=request.app.state.model,
        static_df=request.app.state.static_df,
        forecast=forecast,
    )
    result["active_window"] = f"{hours}hr"
    result["elapsed_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    return result


# ── /ecmwf ────────────────────────────────────────────────────────────────────
@app.get("/ecmwf", summary="Raw ECMWF forecast values for Legazpi grid cell")
async def ecmwf_raw():
    """
    Proxied by `src/app/api/ecmwf/route.ts`.
    Returns raw rainfall without running model inference.
    Used by PredictionPanel to display current ECMWF conditions.
    """
    forecast: RainfallForecast = await fetch_rainfall_forecast()
    return {
        "forecast_time": forecast.forecast_time,
        "rain_1hr_mm": forecast.rain_1hr,
        "rain_3hr_mm": forecast.rain_3hr,
        "rain_6hr_mm": forecast.rain_6hr,
        "grid_lat": 13.1,
        "grid_lon": 123.7,
    }