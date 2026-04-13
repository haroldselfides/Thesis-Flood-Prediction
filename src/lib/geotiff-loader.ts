/**
 * GeoTIFF Loader — loads raster layers exported from QGIS.
 *
 * QGIS EXPORT INSTRUCTIONS:
 * 1. In QGIS, right-click layer → Export → Save As...
 * 2. Format: GeoTIFF
 * 3. CRS: EPSG:4326 (WGS84) — reproject from EPSG:32651 for web display
 * 4. Resolution: keep original or resample to ~30m
 * 5. Save to: public/spatial/<layer_name>.tif
 *
 * IMPORTANT: Rasters MUST be in EPSG:4326 for Leaflet overlay.
 * The original EPSG:32651 is kept for model input (Python backend).
 */

import type { SpatialLayerId } from "@/types";

export interface RasterData {
  layerId: SpatialLayerId;
  /** Raw pixel values as Float32Array or similar */
  values: number[][];
  /** Geographic bounds [west, south, east, north] */
  bounds: [number, number, number, number];
  width: number;
  height: number;
  noDataValue: number | null;
  /** Min/max of actual data values */
  stats: { min: number; max: number; mean: number };
}

/**
 * Load a GeoTIFF file and extract raster data.
 * Uses the geotiff library.
 */
export async function loadGeoTIFF(
  url: string,
  layerId: SpatialLayerId
): Promise<RasterData> {
  // Dynamic import to avoid SSR issues
  const GeoTIFF = await import("geotiff");

  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();

  const width = image.getWidth();
  const height = image.getHeight();
  const [west, south, east, north] = image.getBoundingBox();
  const rasterData = await image.readRasters();
  const band = rasterData[0] as Float32Array | Int16Array;

  // Get nodata value
  const fileDirectory = image.getFileDirectory();
  const noDataValue =
    fileDirectory.GDAL_NODATA !== undefined
      ? parseFloat(fileDirectory.GDAL_NODATA)
      : null;

  // Convert 1D array to 2D and compute stats
  const values: number[][] = [];
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;

  for (let row = 0; row < height; row++) {
    values[row] = [];
    for (let col = 0; col < width; col++) {
      const val = band[row * width + col];
      values[row][col] = val;

      if (noDataValue === null || val !== noDataValue) {
        if (val < min) min = val;
        if (val > max) max = val;
        sum += val;
        count++;
      }
    }
  }

  return {
    layerId,
    values,
    bounds: [west, south, east, north],
    width,
    height,
    noDataValue,
    stats: {
      min: count > 0 ? min : 0,
      max: count > 0 ? max : 0,
      mean: count > 0 ? sum / count : 0,
    },
  };
}

/**
 * Sample a raster value at a given lat/lng coordinate.
 * Returns null if outside bounds or nodata.
 */
export function sampleRaster(
  raster: RasterData,
  lat: number,
  lng: number
): number | null {
  const [west, south, east, north] = raster.bounds;

  if (lat < south || lat > north || lng < west || lng > east) {
    return null;
  }

  const col = Math.floor(
    ((lng - west) / (east - west)) * raster.width
  );
  const row = Math.floor(
    ((north - lat) / (north - south)) * raster.height
  );

  if (row < 0 || row >= raster.height || col < 0 || col >= raster.width) {
    return null;
  }

  const value = raster.values[row][col];

  if (raster.noDataValue !== null && value === raster.noDataValue) {
    return null;
  }

  return value;
}
