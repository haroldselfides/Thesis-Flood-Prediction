import { NextResponse } from 'next/server'

const FASTAPI_URL = process.env.FASTAPI_URL ?? 'http://localhost:8000'

export async function GET() {
  try {
    const res = await fetch(`${FASTAPI_URL}/ecmwf`, { cache: 'no-store' })

    if (!res.ok) {
      const error = await res.text()
      return NextResponse.json(
        { error: `FastAPI error: ${res.status}`, detail: error },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error('[/api/ecmwf] Failed to reach FastAPI:', err)
    return NextResponse.json(
      { error: 'Could not reach ECMWF backend.' },
      { status: 503 }
    )
  }
}