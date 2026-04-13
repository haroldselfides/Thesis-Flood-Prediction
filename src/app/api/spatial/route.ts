import { NextResponse } from "next/server";
import { SPATIAL_LAYERS } from "@/lib/constants";

/**
 * GET /api/spatial
 *
 * Returns metadata about available spatial layers.
 * The actual GeoTIFF files are served as static files from public/spatial/.
 */
export async function GET() {
  const layers = Object.values(SPATIAL_LAYERS).map((layer) => ({
    id: layer.id,
    label: layer.label,
    description: layer.description,
    unit: layer.unit,
    source: layer.source,
    filePath: layer.filePath,
    valueRange: layer.valueRange,
  }));

  return NextResponse.json({
    success: true,
    data: {
      layers,
      crs: "EPSG:4326 (display) / EPSG:32651 (processing)",
      studyArea: "Legazpi City, Albay, Philippines",
    },
    timestamp: new Date().toISOString(),
  });
}
