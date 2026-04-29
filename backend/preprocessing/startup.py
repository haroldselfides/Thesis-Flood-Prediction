"""
startup.py — load all heavy resources once at server startup.

Loads:
  - XGBoost flood model (single model, 25 features)
  - Static terrain features for all 55 607 inference points
  - Barangay lookup: maps each point_id -> barangay name via spatial join
"""

from __future__ import annotations

import logging
import time
from pathlib import Path

import geopandas as gpd
import pandas as pd
import xgboost as xgb
from shapely.geometry import Point

logger = logging.getLogger(__name__)

BASE_DIR         = Path(__file__).resolve().parent.parent
MODEL_DIR        = BASE_DIR / "model"
MODEL_PATH       = MODEL_DIR / "flood_model.json"
POINTS_CSV_PATH  = BASE_DIR.parent / "public" / "spatial" / "inference_points.csv"
BARANGAY_GEOJSON = BASE_DIR.parent / "public" / "spatial" / "guicadale_map.geojson"


def load_single_model() -> xgb.Booster:
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")
    booster = xgb.Booster()
    booster.load_model(str(MODEL_PATH))
    logger.info("XGBoost model loaded. Features: %s", booster.feature_names)
    return booster


def load_static_features() -> pd.DataFrame:
    if not POINTS_CSV_PATH.exists():
        raise FileNotFoundError(f"Inference points CSV not found: {POINTS_CSV_PATH}")
    t0 = time.perf_counter()
    df = pd.read_csv(POINTS_CSV_PATH)
    logger.info("Static features loaded: %d points, %d columns (%.2fs).",
                len(df), len(df.columns), time.perf_counter() - t0)
    return df


def build_barangay_lookup(
    points_df: pd.DataFrame,
    geojson_path: Path = BARANGAY_GEOJSON,
) -> pd.DataFrame | None:
    if not geojson_path.exists():
        logger.warning("Barangay GeoJSON not found at %s; barangay aggregation disabled.", geojson_path)
        return None
    try:
        t0 = time.perf_counter()
        pts_gdf = gpd.GeoDataFrame(
            points_df[["point_id"]].copy(),
            geometry=[Point(xy) for xy in zip(points_df["lon"], points_df["lat"])],
            crs="EPSG:4326",
        )
        bgy_gdf = gpd.read_file(geojson_path)[["ADM4_EN", "geometry"]].rename(
            columns={"ADM4_EN": "barangay"}
        ).set_crs("EPSG:4326", allow_override=True)

        joined = gpd.sjoin(pts_gdf, bgy_gdf, how="left", predicate="within")
        lookup = joined[["point_id", "barangay"]].reset_index(drop=True)
        matched = lookup["barangay"].notna().sum()
        logger.info("Barangay lookup built: %d/%d points matched (%.2fs).",
                    matched, len(lookup), time.perf_counter() - t0)
        return lookup
    except Exception as exc:
        logger.error("Failed to build barangay lookup: %s", exc, exc_info=True)
        return None
