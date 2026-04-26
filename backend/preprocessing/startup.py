"""
backend/preprocessing/startup.py
Load assets once at API startup (called from backend/main.py lifespan).

Supports two gpkg formats:
  - Legacy (Legazpi): elev_mean, slope_mean, flowacc_mean, distriver_mean,
                      twi_mean, geology_majority, lulc_majority
  - New (GUICADALE):  elev_1, slope_1, flowacc_1, distriver_1,
                      twi_1, geol_1, lulc_1  (already model-ready)
"""

import logging
import numpy as np
import pandas as pd
import geopandas as gpd
from xgboost import XGBClassifier

logger = logging.getLogger(__name__)

# Columns that indicate the gpkg is already in model-ready format
NEW_FORMAT_INDICATOR = "elev_1"

# Legacy format: columns that need renaming + engineering
LEGACY_RENAME = {
    "bgy_name":       "barangay",
    "elev_mean":      "elevation",
    "slope_mean":     "slope",
    "flowacc_mean":   "flow_accumulation",
    "distriver_mean": "distance_from_river",
    "twi_mean":       "twi",
}

LOG1P_FEATURES = [
    "elevation", "slope", "flow_accumulation",
    "distance_from_river", "twi", "spi",
    "rainfall_mean_annual", "drainage_density",
    "catchment_area", "curvature",
]

GEOLOGY_CODE_MAP = {
    1: "alluvial", 2: "volcanic", 3: "limestone",
    4: "sedimentary", 5: "metamorphic", 6: "volcanic",
}
GEOLOGY_CATEGORIES = ["alluvial", "volcanic", "limestone", "sedimentary", "metamorphic"]
LULC_BUILT_UP_COL = "lulc_built_up"
LULC_BUILT_UP_CODE = 50

# 16 static features built by legacy pipeline
MODEL_FEATURE_COLUMNS = (
    [f"log_{f}" for f in LOG1P_FEATURES]
    + [f"geology_{g}" for g in GEOLOGY_CATEGORIES]
    + [LULC_BUILT_UP_COL]
)


def load_model(model_path: str) -> XGBClassifier:
    model = XGBClassifier()
    model.load_model(model_path)
    logger.info(f"Model loaded from {model_path}")
    return model


def _load_legacy(df: pd.DataFrame) -> pd.DataFrame:
    """Feature engineering for old-format gpkg (elev_mean, slope_mean, etc.)"""
    df = df.rename(columns=LEGACY_RENAME)

    for feat in ["spi", "rainfall_mean_annual", "drainage_density", "catchment_area", "curvature"]:
        df[feat] = 0.0
        logger.warning(f"Column '{feat}' not in gpkg — filled with 0")

    for feat in LOG1P_FEATURES:
        df[f"log_{feat}"] = np.log1p(df[feat].astype(float))
    logger.info("log1p applied to 10 features")

    if "geology_majority" in df.columns:
        geology_cat = df["geology_majority"].fillna(0).astype(int).map(GEOLOGY_CODE_MAP).fillna("unknown")
        for cat in GEOLOGY_CATEGORIES:
            df[f"geology_{cat}"] = (geology_cat == cat).astype(int)
        logger.info("Geology one-hot encoded")
    else:
        for cat in GEOLOGY_CATEGORIES:
            df[f"geology_{cat}"] = 0

    if "lulc_majority" in df.columns:
        df[LULC_BUILT_UP_COL] = (
            df["lulc_majority"].fillna(0).astype(int) == LULC_BUILT_UP_CODE
        ).astype(int)
    else:
        df[LULC_BUILT_UP_COL] = 0

    return df


def _load_new_format(df: pd.DataFrame) -> pd.DataFrame:
    """New-format gpkg already has elev_1, slope_1, etc. — minimal processing."""
    if "bgy_name" in df.columns:
        df = df.rename(columns={"bgy_name": "barangay"})
    logger.info("New-format gpkg detected — skipping legacy feature engineering")
    return df


def load_static_features(gpkg_path: str) -> pd.DataFrame:
    gdf: gpd.GeoDataFrame = gpd.read_file(gpkg_path)
    logger.info(f"Loaded GeoPackage: {len(gdf)} rows, columns: {gdf.columns.tolist()}")
    df = gdf.drop(columns="geometry").copy()

    # ── Detect format and apply appropriate pipeline ──────────────────────────
    if NEW_FORMAT_INDICATOR in df.columns:
        logger.info("Detected new-format gpkg (elev_1, slope_1, ...)")
        df = _load_new_format(df)
    else:
        logger.info("Detected legacy gpkg (elev_mean, slope_mean, ...)")
        df = _load_legacy(df)

    # ── No cluster CSV needed — default tc_cluster to 0 ──────────────────────
    df["tc_cluster"] = 0

    logger.info(f"Static feature table ready: {df.shape}")
    return df