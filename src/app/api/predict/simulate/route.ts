import { NextRequest, NextResponse } from "next/server";

const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

/**
 * GET /api/predict/simulate
 * Proxies to FastAPI GET /predict/simulate
 *
 * Query params:
 *   rain_1hr  – 1-hour rainfall in mm  (default 0)
 *   rain_3hr  – 3-hour rainfall in mm  (default 0)
 *   rain_6hr  – 6-hour rainfall in mm  (default 0)
 *   window    – active window: "1hr" | "3hr" | "6hr"  (default "3hr")
 *
 * Bypasses ECMWF entirely — uses manually specified rainfall values.
 * Returns same shape as /api/predict plus `simulated: true`.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const rain_1hr = searchParams.get("rain_1hr") ?? "0";
    const rain_3hr = searchParams.get("rain_3hr") ?? "0";
    const rain_6hr = searchParams.get("rain_6hr") ?? "0";
    const window = searchParams.get("window") ?? "3hr";

    const params = new URLSearchParams({ rain_1hr, rain_3hr, rain_6hr, window });

    const res = await fetch(`${FASTAPI_URL}/predict/simulate?${params}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      const error = await res.text();
      return NextResponse.json(
        { error: `FastAPI error: ${res.status}`, detail: error },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/predict/simulate] Failed to reach FastAPI:", err);
    return NextResponse.json(
      { error: "Could not reach prediction backend." },
      { status: 503 }
    );
  }
}
