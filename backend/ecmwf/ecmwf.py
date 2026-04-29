"""
ECMWF open-data rainfall fetcher for Legazpi City, Philippines.
Returns hourly + accumulated rainfall estimates from the latest 0.25-deg forecast.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import eccodes
import httpx
import numpy as np

logger = logging.getLogger(__name__)

LEGAZPI_LAT = 13.15
LEGAZPI_LON = 123.73
ECMWF_BASE  = "https://data.ecmwf.int/forecasts"
STEPS       = [1, 3, 6]


@dataclass
class RainfallForecast:
    rain_1hr: float = 0.0
    rain_3hr: float = 0.0
    rain_6hr: float = 0.0
    forecast_time: Optional[datetime] = None
    is_fallback: bool = False
    rain_72h_prior: float = 0.0


def _latest_run_url(step: int) -> str:
    now = datetime.now(timezone.utc)
    run_hour = 0 if now.hour < 12 else 12
    date_str = now.strftime("%Y%m%d")
    return (
        f"{ECMWF_BASE}/{date_str}/{run_hour:02d}z/ifs/0p25/oper/"
        f"{date_str}{run_hour:02d}0000-{step}h-oper-fc.grib2"
    )


def _extract_tp_at(grib_bytes: bytes, lat: float, lon: float) -> float:
    msgs = []
    with eccodes.StreamReader(grib_bytes) as reader:
        for msg in reader:
            if msg.get("shortName") == "tp":
                msgs.append(msg)
    if not msgs:
        raise ValueError("No TP field found in GRIB2 data")
    msg  = msgs[-1]
    lats = np.asarray(msg.get("latitudes"))
    lons = np.asarray(msg.get("longitudes"))
    vals = np.asarray(msg.get("values"))
    dist = (lats - lat) ** 2 + (lons - lon) ** 2
    idx  = int(np.argmin(dist))
    return max(0.0, float(vals[idx]) * 1000.0)


def fetch_rainfall(lat: float = LEGAZPI_LAT, lon: float = LEGAZPI_LON) -> RainfallForecast:
    try:
        tp_values: dict[int, float] = {}
        for step in STEPS:
            url  = _latest_run_url(step)
            logger.info("Fetching ECMWF TP step=%dh: %s", step, url)
            resp = httpx.get(url, timeout=30, follow_redirects=True)
            resp.raise_for_status()
            tp_values[step] = _extract_tp_at(resp.content, lat, lon)
            logger.info("  TP[%dh] = %.3f mm", step, tp_values[step])

        rain_1hr = round(tp_values[1], 3)
        rain_3hr = round(tp_values[3], 3)
        rain_6hr = round(tp_values[6], 3)
        if rain_1hr == 0.0 and rain_3hr > 0.0:
            rain_1hr = round(rain_3hr / 3.0, 3)

        return RainfallForecast(
            rain_1hr=rain_1hr,
            rain_3hr=rain_3hr,
            rain_6hr=rain_6hr,
            forecast_time=datetime.now(timezone.utc),
            is_fallback=False,
        )

    except Exception as exc:
        logger.warning("ECMWF fetch failed (%s); returning zero-rainfall fallback.", exc)
        return RainfallForecast(
            rain_1hr=0.0,
            rain_3hr=0.0,
            rain_6hr=0.0,
            forecast_time=datetime.now(timezone.utc),
            is_fallback=True,
        )
