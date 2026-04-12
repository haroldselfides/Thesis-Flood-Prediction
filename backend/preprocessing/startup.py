"""
backend/preprocessing/startup.py
Load assets once at API startup (called from backend/main.py lifespan).
"""

import logging
import numpy as np
import pandas as pd
import geopandas as gpd
from xgboost import XGBClassifier

logger = logging.getLogger(__name__)

# ── Actual column names in legazpi_spatial_features_final_last.gpkg ───────────
#
#   bgy_name          → barangay identifier
#   elev_mean         → elevation
#   slope_mean        → slope
#   flowacc_mean      → flow_accumulation
#   distriver_mean    → distance_from_river
#   twi_mean          → twi
#   geology_majority  → geology (numeric codes 1–6)
#   lulc_majority     → lulc (10 = non built-up, 50 = built-up)
#
# Missing from gpkg (not collected): spi, rainfall_mean_annual,
#   drainage_density, catchment_area, curvature → filled with 0

# ── Features that get log1p ───────────────────────────────────────────────────
LOG1P_FEATURES = [
    "elevation", "slope", "flow_accumulation",
    "distance_from_river", "twi", "spi",
    "rainfall_mean_annual", "drainage_density",
    "catchment_area", "curvature",
]

# ── Geology numeric code → category name mapping ──────────────────────────────
# Codes observed in gpkg: 1.0, 2.0, 3.0, 4.0, 5.0, 6.0
GEOLOGY_CODE_MAP = {
    1: "alluvial",
    2: "volcanic",
    3: "limestone",
    4: "sedimentary",
    5: "metamorphic",
    6: "volcanic",   # code 6 also treated as volcanic
}
GEOLOGY_CATEGORIES = ["alluvial", "volcanic", "limestone", "sedimentary", "metamorphic"]

LULC_BUILT_UP_COL = "lulc_built_up"
# lulc_majority codes: 10 = non built-up, 50 = built-up
LULC_BUILT_UP_CODE = 50

# ── 16 static features expected by the XGBoost model ─────────────────────────
MODEL_FEATURE_COLUMNS = (
    [f"log_{f}" for f in LOG1P_FEATURES]           # 10 log-transformed
    + [f"geology_{g}" for g in GEOLOGY_CATEGORIES] # 5 one-hot
    + [LULC_BUILT_UP_COL]                          # 1 binary
)


def load_model(model_path: str) -> XGBClassifier:
    """
    Load XGBoost model from JSON.
    Expected path: backend/model/xgboost_flood_model.json
    """
    model = XGBClassifier()
    model.load_model(model_path)
    logger.info(f"Model loaded from {model_path}")
    return model


def load_static_features(gpkg_path: str) -> pd.DataFrame:
    """
    Load the 71-barangay GeoPackage, apply feature engineering,
    and return a ready-to-use 71-row DataFrame.

    Actual gpkg columns used:
      bgy_name, elev_mean, slope_mean, flowacc_mean,
      distriver_mean, twi_mean, geology_majority, lulc_majority
    """
    gdf: gpd.GeoDataFrame = gpd.read_file(gpkg_path)
    logger.info(f"Loaded GeoPackage: {len(gdf)} barangays")
    df = gdf.drop(columns="geometry").copy()

    # ── Rename gpkg columns to standard names ─────────────────────────────────
    df = df.rename(columns={
        "bgy_name":       "barangay",
        "elev_mean":      "elevation",
        "slope_mean":     "slope",
        "flowacc_mean":   "flow_accumulation",
        "distriver_mean": "distance_from_river",
        "twi_mean":       "twi",
    })

    # ── Fill missing features with 0 ──────────────────────────────────────────
    for feat in ["spi", "rainfall_mean_annual", "drainage_density", "catchment_area", "curvature"]:
        df[feat] = 0.0
        logger.warning(f"Column '{feat}' not in gpkg — filled with 0")

    # ── 1. log1p on 10 skewed features ────────────────────────────────────────
    for feat in LOG1P_FEATURES:
        df[f"log_{feat}"] = np.log1p(df[feat].astype(float))
    logger.info("log1p applied to 10 features")

    # ── 2. One-hot encode geology (numeric codes → 5 category columns) ────────
    if "geology_majority" in df.columns:
        geology_cat = df["geology_majority"].fillna(0).astype(int).map(GEOLOGY_CODE_MAP).fillna("unknown")
        for cat in GEOLOGY_CATEGORIES:
            df[f"geology_{cat}"] = (geology_cat == cat).astype(int)
        logger.info("Geology one-hot encoded from numeric codes")
    else:
        logger.warning("'geology_majority' missing — filling all geology one-hots with 0")
        for cat in GEOLOGY_CATEGORIES:
            df[f"geology_{cat}"] = 0

    # ── 3. Binary LULC built-up flag ──────────────────────────────────────────
    if "lulc_majority" in df.columns:
        df[LULC_BUILT_UP_COL] = (
            df["lulc_majority"].fillna(0).astype(int) == LULC_BUILT_UP_CODE
        ).astype(int)
        built_up_count = df[LULC_BUILT_UP_COL].sum()
        logger.info(f"LULC built-up flag set — {built_up_count} built-up barangays")
    else:
        logger.warning("'lulc_majority' missing — filling lulc_built_up with 0")
        df[LULC_BUILT_UP_COL] = 0

    # ── 4. Merge cluster assignments ──────────────────────────────────────────
    cluster_path = gpkg_path.replace(
        "legazpi_spatial_features_final_last.gpkg",
        "barangay_cluster_assignments.csv",
    )
    try:
        clusters = pd.read_csv(cluster_path)
        # Rename whatever column names the CSV has to standard names
        clusters = clusters.rename(columns={
            "bgy_name":   "barangay",
            "cluster_id": "tc_cluster",
        })
        df = df.merge(clusters[["barangay", "tc_cluster"]], on="barangay", how="left")
        df["tc_cluster"] = df["tc_cluster"].fillna(0).astype(int)
        logger.info("tc_cluster assignments merged")
    except FileNotFoundError:
        logger.warning(f"barangay_cluster_assignments.csv not found — tc_cluster=0")
        df["tc_cluster"] = 0

    # ── 5. Validate all 16 model features present ─────────────────────────────
    missing = [c for c in MODEL_FEATURE_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Static feature table missing columns: {missing}")

    logger.info(f"Static feature table ready: {df.shape} — columns: {MODEL_FEATURE_COLUMNS}")
    return df  # 71 rows