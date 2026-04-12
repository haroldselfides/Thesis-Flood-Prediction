"""
backend/ecmwf/ecmwf.py — Fetch latest ECMWF open-data forecast and extract
rainfall features for the Legazpi City grid cell (~13.1N, 123.7E).

ECMWF Open Data: https://data.ecmwf.int/forecasts/
  - Parameter : tp  (total precipitation, unit: metres, cumulative from t=0)
  - Steps used : 3h, 6h  ← HRES oper steps are 0-144h by 3h ONLY; 1h does not exist
  - Target cell: lat=13.1, lon=123.7  (nearest 0.25 deg HRES grid point)

URL pattern:
  {BASE}/{YYYYMMDD}/{HH}z/ifs/0p25/oper/{YYYYMMDD}{HH}0000-{step}h-oper-fc.grib2

Performance strategy — index-guided Range download:
  Each GRIB2 file has a paired .index file (JSON-lines) that maps every field
  to its byte offset + length. We fetch the tiny index (~50 KB) first, find
  the byte range for `tp`, then issue a single HTTP Range request for just
  those bytes (~300 KB) instead of the full ~128 MB file.

Publication lag:
  00z run -> available ~06z UTC
  12z run -> available ~18z UTC
"""

import json
import logging
import os
import tempfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx
import numpy as np
import xarray as xr

logger = logging.getLogger(__name__)

TARGET_LAT = 13.1
TARGET_LON = 123.7
ECMWF_BASE = "https://data.ecmwf.int/forecasts"

# HRES oper precipitation is available at 3-hourly steps only (0–144h).
# Step 1h does NOT exist for the oper stream.
STEPS = [3, 6]

M_TO_MM = 1000.0
MAX_RETRIES = 3
TIMEOUT = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=5.0)


@dataclass
class RainfallForecast:
    rain_1hr: float    # estimated: tp[3h] / 3  (mean hourly rate over 0-3h)
    rain_3hr: float    # tp[3h]  — 0-3h accumulation
    rain_6hr: float    # tp[6h]  — 0-6h accumulation
    forecast_time: str  # ISO-8601 UTC of the model run


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------

def _build_url(run_dt: datetime, step: int) -> str:
    date_str = run_dt.strftime("%Y%m%d")
    hh = run_dt.strftime("%H")
    filename = f"{date_str}{hh}0000-{step}h-oper-fc.grib2"
    return f"{ECMWF_BASE}/{date_str}/{hh}z/ifs/0p25/oper/{filename}"


def _index_url(grib_url: str) -> str:
    return grib_url.replace(".grib2", ".index")


def _latest_run_dt() -> datetime:
    """
    Return the datetime of the most recently *published* 00z or 12z run.

    Publication lag (approximate):
      00z run -> available ~06z UTC
      12z run -> available ~18z UTC

    Schedule:
      now.hour in [00, 06) -> yesterday 12z
      now.hour in [06, 18) -> today    00z
      now.hour in [18, 24) -> today    12z
    """
    now = datetime.now(timezone.utc)
    if now.hour >= 18:
        return now.replace(hour=12, minute=0, second=0, microsecond=0)
    elif now.hour >= 6:
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        yesterday = now - timedelta(days=1)
        return yesterday.replace(hour=12, minute=0, second=0, microsecond=0)


# ---------------------------------------------------------------------------
# Index-guided partial download
# ---------------------------------------------------------------------------

async def _get_tp_byte_range(client: httpx.AsyncClient, index_url: str) -> tuple[int, int]:
    """
    Fetch the .index file and return the (start, end) byte range for the
    `tp` (total precipitation) field.

    The index is a JSON-lines file; each line looks like:
      {"param": "tp", "_offset": 12345678, "_length": 291840, ...}
    """
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = await client.get(index_url)
            resp.raise_for_status()
            break
        except (httpx.HTTPStatusError, httpx.TransportError) as e:
            if attempt == MAX_RETRIES:
                raise
            logger.warning(f"Index fetch attempt {attempt} failed: {e}. Retrying...")

    for line in resp.text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        if record.get("param") == "tp":
            offset = int(record["_offset"])
            length = int(record["_length"])
            return offset, offset + length - 1

    raise ValueError(f"'tp' field not found in ECMWF index: {index_url}")


async def _download_range(
    client: httpx.AsyncClient, grib_url: str, byte_start: int, byte_end: int
) -> bytes:
    """
    Download only the bytes [byte_start, byte_end] of the GRIB2 file using
    an HTTP Range request. Retries up to MAX_RETRIES times on failure.
    """
    headers = {"Range": f"bytes={byte_start}-{byte_end}"}
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = await client.get(grib_url, headers=headers)
            # 206 Partial Content is the success code for Range requests
            if resp.status_code not in (200, 206):
                resp.raise_for_status()
            return resp.content
        except (httpx.HTTPStatusError, httpx.TransportError, httpx.RemoteProtocolError) as e:
            if attempt == MAX_RETRIES:
                raise
            logger.warning(
                f"Range download attempt {attempt} failed ({byte_start}-{byte_end}): "
                f"{e}. Retrying..."
            )

    raise RuntimeError("Unreachable")  # MAX_RETRIES exhausted above


# ---------------------------------------------------------------------------
# GRIB2 extraction
# ---------------------------------------------------------------------------

def _extract_tp_from_grib_bytes(grib_bytes: bytes, step: int) -> float:
    """
    Parse a partial GRIB2 byte blob (just the tp field), return the value
    (metres) at the nearest grid point to TARGET_LAT/LON.
    """
    with tempfile.NamedTemporaryFile(suffix=".grib2", delete=False) as tmp:
        tmp.write(grib_bytes)
        tmp_path = tmp.name
    try:
        ds = xr.open_dataset(
            tmp_path,
            engine="cfgrib",
            backend_kwargs={"filter_by_keys": {"shortName": "tp"}},
        )
        lon_ecmwf = TARGET_LON % 360
        tp = ds["tp"]
        lat_idx = int(np.abs(tp.latitude.values - TARGET_LAT).argmin())
        lon_idx = int(np.abs(tp.longitude.values - lon_ecmwf).argmin())
        value_m = float(tp.values[lat_idx, lon_idx])
        ds.close()
        return value_m
    finally:
        os.unlink(tmp_path)


# ---------------------------------------------------------------------------
# Per-step fetch with fallback
# ---------------------------------------------------------------------------

async def _fetch_step(
    client: httpx.AsyncClient, run_dt: datetime, step: int
) -> tuple[float, datetime]:
    """
    Fetch tp for a single step using index-guided Range download.
    Falls back to the previous run (12h earlier) on 404.
    Returns (value_metres, actual_run_dt_used).
    """
    from fastapi import HTTPException

    for run, label in [(run_dt, "primary"), (run_dt - timedelta(hours=12), "fallback")]:
        grib_url = _build_url(run, step)
        idx_url = _index_url(grib_url)
        logger.info(f"[{label}] Fetching index step={step}h -> {idx_url}")

        try:
            byte_start, byte_end = await _get_tp_byte_range(client, idx_url)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                logger.warning(f"[{label}] Index 404 for step={step}h, trying fallback run...")
                continue
            logger.error(f"ECMWF index fetch failed (step={step}h): {e}")
            raise HTTPException(status_code=503, detail=f"ECMWF index unavailable (step={step}h): {e}")

        logger.info(
            f"[{label}] tp byte range: {byte_start}-{byte_end} "
            f"({(byte_end - byte_start) / 1024:.1f} KB) for step={step}h"
        )

        try:
            grib_bytes = await _download_range(client, grib_url, byte_start, byte_end)
        except (httpx.HTTPStatusError, httpx.TransportError, httpx.RemoteProtocolError) as e:
            logger.error(f"ECMWF Range download failed (step={step}h): {e}")
            raise HTTPException(status_code=503, detail=f"ECMWF download failed (step={step}h): {e}")

        value_m = _extract_tp_from_grib_bytes(grib_bytes, step)
        logger.info(f"  tp[{step}h] = {value_m:.6f} m  (run: {run.isoformat()})")
        return value_m, run

    raise HTTPException(
        status_code=503,
        detail=f"ECMWF data unavailable for step={step}h — both primary and fallback runs returned 404.",
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def fetch_rainfall_forecast() -> RainfallForecast:
    """
    Main pipeline — called by endpoints in backend/main.py.

    1. Determines latest *published* ECMWF run (00z or 12z).
    2. Fetches the .index file (~50 KB) to find the byte range of `tp`.
    3. Issues a single HTTP Range request for just those bytes (~300 KB)
       instead of downloading the full ~128 MB GRIB2 file.
    4. Retries up to 3 times on network errors; falls back to the previous
       run on 404.
    5. Derives rain_1hr = tp[3h] / 3 (mean hourly rate; step 1h doesn't exist).
    6. Returns RainfallForecast dataclass.

    Accumulation semantics (ECMWF tp is cumulative from t=0):
      rain_3hr = tp[3]       (0-3h accumulation)
      rain_6hr = tp[6]       (0-6h accumulation)
      rain_1hr = tp[3] / 3   (mean mm/hr over the first 3 hours)
    """
    run_dt = _latest_run_dt()
    values_m: dict[int, float] = {}
    actual_run_dt = run_dt

    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
        for step in STEPS:
            value_m, used_run_dt = await _fetch_step(client, run_dt, step)
            values_m[step] = value_m
            actual_run_dt = used_run_dt

    rain_3hr = round(values_m[3] * M_TO_MM, 3)
    rain_6hr = round(values_m[6] * M_TO_MM, 3)
    rain_1hr = round(rain_3hr / 3.0, 3)

    logger.info(
        f"Rainfall mm -> 1h:{rain_1hr} (derived)  3h:{rain_3hr}  6h:{rain_6hr}"
    )

    return RainfallForecast(
        rain_1hr=rain_1hr,
        rain_3hr=rain_3hr,
        rain_6hr=rain_6hr,
        forecast_time=actual_run_dt.isoformat(),
    )


# ---------------------------------------------------------------------------
# Validation helper
# ---------------------------------------------------------------------------

def validate_rainfall_units(rain_mm: float, label: str = "rain") -> None:
    """
    Guard against silent unit mismatch (metres passed instead of mm).
    Called in preprocessing/predictor.py before building the feature matrix.
    """
    if rain_mm < 0:
        raise ValueError(f"{label} is negative ({rain_mm}mm) — check ECMWF extraction.")
    if rain_mm < 0.01:
        logger.warning(
            f"WARNING: {label}={rain_mm} mm looks suspiciously low. "
            "Did you forget to multiply metres x 1000?"
        )
    if rain_mm > 500:
        logger.warning(f"WARNING: {label}={rain_mm} mm is extremely high — verify ECMWF data.")