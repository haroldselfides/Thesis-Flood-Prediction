"""
backend/ecmwf/ecmwf.py — Fetch latest ECMWF open-data forecast and extract
rainfall features for the Legazpi City grid cell (~13.1N, 123.7E).
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
STEPS = [3, 6]
M_TO_MM = 1000.0
MAX_RETRIES = 3
TIMEOUT = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=5.0)

# Fallback values used when ECMWF is unreachable (climatological average for Legazpi)
FALLBACK_RAIN_3HR_MM = 1.0
FALLBACK_RAIN_6HR_MM = 2.0


@dataclass
class RainfallForecast:
    rain_1hr: float
    rain_3hr: float
    rain_6hr: float
    forecast_time: str
    is_fallback: bool = False   # True when ECMWF was unreachable


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
    now = datetime.now(timezone.utc)
    if now.hour >= 18:
        return now.replace(hour=12, minute=0, second=0, microsecond=0)
    elif now.hour >= 6:
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        yesterday = now - timedelta(days=1)
        return yesterday.replace(hour=12, minute=0, second=0, microsecond=0)


def _fallback_forecast() -> RainfallForecast:
    """Return a safe default forecast when ECMWF is unreachable."""
    rain_3hr = FALLBACK_RAIN_3HR_MM
    rain_6hr = FALLBACK_RAIN_6HR_MM
    rain_1hr = round(rain_3hr / 3.0, 3)
    logger.warning(
        f"Using fallback rainfall values: 1h={rain_1hr}mm 3h={rain_3hr}mm 6h={rain_6hr}mm"
    )
    return RainfallForecast(
        rain_1hr=rain_1hr,
        rain_3hr=rain_3hr,
        rain_6hr=rain_6hr,
        forecast_time=datetime.now(timezone.utc).isoformat(),
        is_fallback=True,
    )


# ---------------------------------------------------------------------------
# Index-guided partial download
# ---------------------------------------------------------------------------

async def _get_tp_byte_range(
    client: httpx.AsyncClient, index_url: str
) -> tuple[int, int]:
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
    headers = {"Range": f"bytes={byte_start}-{byte_end}"}
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = await client.get(grib_url, headers=headers)
            if resp.status_code not in (200, 206):
                resp.raise_for_status()
            return resp.content
        except (httpx.HTTPStatusError, httpx.TransportError, httpx.RemoteProtocolError) as e:
            if attempt == MAX_RETRIES:
                raise
            logger.warning(
                f"Range download attempt {attempt} failed "
                f"({byte_start}-{byte_end}): {e}. Retrying..."
            )

    raise RuntimeError("MAX_RETRIES exhausted")


# ---------------------------------------------------------------------------
# GRIB2 extraction
# ---------------------------------------------------------------------------

def _extract_tp_from_grib_bytes(grib_bytes: bytes, step: int) -> float:
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
# Per-step fetch
# ---------------------------------------------------------------------------

async def _fetch_step(
    client: httpx.AsyncClient, run_dt: datetime, step: int
) -> tuple[float, datetime]:
    for run, label in [(run_dt, "primary"), (run_dt - timedelta(hours=12), "fallback")]:
        grib_url = _build_url(run, step)
        idx_url = _index_url(grib_url)
        logger.info(f"[{label}] Fetching index step={step}h -> {idx_url}")

        try:
            byte_start, byte_end = await _get_tp_byte_range(client, idx_url)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                logger.warning(f"[{label}] 404 for step={step}h, trying fallback run...")
                continue
            raise

        logger.info(
            f"[{label}] tp byte range: {byte_start}-{byte_end} "
            f"({(byte_end - byte_start) / 1024:.1f} KB) for step={step}h"
        )

        try:
            grib_bytes = await _download_range(client, grib_url, byte_start, byte_end)
        except (httpx.HTTPStatusError, httpx.TransportError, httpx.RemoteProtocolError) as e:
            raise RuntimeError(f"ECMWF Range download failed (step={step}h): {e}")

        value_m = _extract_tp_from_grib_bytes(grib_bytes, step)
        logger.info(f"  tp[{step}h] = {value_m:.6f} m  (run: {run.isoformat()})")
        return value_m, run

    raise RuntimeError(
        f"ECMWF data unavailable for step={step}h — both primary and fallback returned 404."
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def fetch_rainfall_forecast() -> RainfallForecast:
    """
    Fetch ECMWF rainfall forecast. Returns fallback values if ECMWF
    is unreachable so the prediction endpoint never returns 503.
    """
    run_dt = _latest_run_dt()
    values_m: dict[int, float] = {}
    actual_run_dt = run_dt

    try:
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
            is_fallback=False,
        )

    except Exception as e:
        logger.error(f"ECMWF fetch failed, using fallback values: {e}")
        return _fallback_forecast()


# ---------------------------------------------------------------------------
# Validation helper
# ---------------------------------------------------------------------------

def validate_rainfall_units(rain_mm: float, label: str = "rain") -> None:
    if rain_mm < 0:
        raise ValueError(f"{label} is negative ({rain_mm}mm) — check ECMWF extraction.")
    if rain_mm < 0.01:
        logger.warning(
            f"WARNING: {label}={rain_mm}mm looks suspiciously low. "
            "Did you forget to multiply metres x 1000?"
        )
    if rain_mm > 500:
        logger.warning(f"WARNING: {label}={rain_mm}mm is extremely high — verify ECMWF data.")