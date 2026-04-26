"""
backend/preprocessing/startup.py
Load assets once at API startup (called from backend/main.py lifespan).
"""

import logging
import pandas as pd
import geopandas as gpd
from xgboost import XGBClassifier

logger = logging.getLogger(__name__)


def load_model(model_path: str) -> XGBClassifier:
    model = XGBClassifier()
    model.load_model(model_path)
    logger.info(f"Model loaded from {model_path}")
    return model


def load_static_features(gpkg_path: str) -> pd.DataFrame:
    gdf: gpd.GeoDataFrame = gpd.read_file(gpkg_path)
    logger.info(f"Loaded GeoPackage: {len(gdf)} barangays, columns: {gdf.columns.tolist()}")
    df = gdf.drop(columns="geometry").copy()

    # Rename bgy_name → barangay if needed
    if "bgy_name" in df.columns:
        df = df.rename(columns={"bgy_name": "barangay"})

    # tc_cluster default 0
    if "tc_cluster" not in df.columns:
        df["tc_cluster"] = 0

    # Validate required columns are present
    required = ["barangay", "elev_1", "slope_1", "flowacc_1",
                "geol_1", "lulc_1", "distriver_1", "twi_1"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(
            f"GeoPackage missing required columns: {missing}\n"
            f"Available: {df.columns.tolist()}"
        )

    logger.info(f"Static feature table ready: {df.shape}")
    return df