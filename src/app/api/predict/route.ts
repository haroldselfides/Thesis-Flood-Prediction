import { NextRequest, NextResponse } from "next/server";

const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

/**
 * GET /api/predict
 * Proxies to FastAPI GET /predict
 * Returns flood probability for all 71 Legazpi barangays.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const window = searchParams.get("window") ?? "3hr";

    const res = await fetch(`${FASTAPI_URL}/predict?window=${window}`, {
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
    console.error("[/api/predict] Failed to reach FastAPI:", err);
    return NextResponse.json(
      { error: "Could not reach prediction backend." },
      { status: 503 }
    );
  }
}

/**
 * POST /api/predict
 * Kept for backward compatibility with existing frontend code that uses POST.
 * Reads the window from the request body and forwards as GET to FastAPI.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const window = body?.window ?? "3hr";

    const res = await fetch(`${FASTAPI_URL}/predict?window=${window}`, {
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
    console.error("[/api/predict] Failed to reach FastAPI:", err);
    return NextResponse.json(
      { error: "Could not reach prediction backend." },
      { status: 503 }
    );
  }
}