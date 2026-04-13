import type { HazardLevel, SpatialLayerId } from "@/types";
import { HAZARD_CLASSIFICATIONS } from "./constants";

/**
 * Normalize a raw raster value to 0-1 range using min-max scaling.
 * Used for all spatial layers before feeding into XGBoost.
 */
export function normalizeValue(
  value: number,
  min: number,
  max: number
): number {
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Inverse normalize — for layers where lower values = higher flood risk.
 * e.g., elevation (lower = more risk), distance from river (closer = more risk)
 */
export function inverseNormalizeValue(
  value: number,
  min: number,
  max: number
): number {
  return 1 - normalizeValue(value, min, max);
}

/**
 * Get hazard level from flood probability value.
 */
export function getHazardLevel(probability: number): HazardLevel {
  const classification = HAZARD_CLASSIFICATIONS.find(
    (h) => probability >= h.range[0] && probability < h.range[1]
  );
  return classification?.level ?? "very_high";
}

/**
 * Format rainfall value for display.
 */
export function formatRainfall(mm: number): string {
  if (mm < 1) return `${mm.toFixed(1)} mm`;
  return `${Math.round(mm)} mm`;
}

/**
 * Format water level for display.
 */
export function formatWaterLevel(meters: number): string {
  if (meters < 0.01) return "< 0.01 m";
  return `${meters.toFixed(2)} m`;
}

/**
 * Format probability as percentage string.
 */
export function formatProbability(prob: number): string {
  return `${Math.round(prob * 100)}%`;
}

/**
 * Spatial layer display order for the sidebar.
 */
export const LAYER_DISPLAY_ORDER: SpatialLayerId[] = [
  "elevation",
  "slope",
  "flow_accumulation",
  "distance_from_river",
  "lulc",
  "geology",
  "rainfall_intensity",
];

/**
 * Convert lat/lng to EPSG:32651 (UTM Zone 51N) approximate.
 * For precise work, use proj4 library.
 */
export function latlngToUTM51N(
  lat: number,
  lng: number
): { easting: number; northing: number } {
  // Simplified UTM conversion for Zone 51N
  const k0 = 0.9996;
  const a = 6378137.0;
  const e2 = 0.00669438;
  const centralMeridian = 123; // Zone 51

  const latRad = (lat * Math.PI) / 180;
  const lngRad = ((lng - centralMeridian) * Math.PI) / 180;

  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
  const T = Math.tan(latRad) ** 2;
  const C = (e2 / (1 - e2)) * Math.cos(latRad) ** 2;
  const A = lngRad * Math.cos(latRad);

  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64) * latRad -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32) * Math.sin(2 * latRad) +
      ((15 * e2 ** 2) / 256) * Math.sin(4 * latRad));

  const easting = k0 * N * (A + ((1 - T + C) * A ** 3) / 6) + 500000;
  const northing = k0 * (M + N * Math.tan(latRad) * (A ** 2 / 2));

  return { easting, northing };
}

/**
 * Clamp a number to a range.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Generate a color from a color ramp based on normalized value (0-1).
 */
export function interpolateColor(
  normalizedValue: number,
  colorRamp: string[]
): string {
  const v = clamp(normalizedValue, 0, 1);
  const idx = v * (colorRamp.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.min(lower + 1, colorRamp.length - 1);
  const t = idx - lower;

  if (t === 0) return colorRamp[lower];

  // Simple hex color interpolation
  const c1 = hexToRgb(colorRamp[lower]);
  const c2 = hexToRgb(colorRamp[upper]);

  const r = Math.round(c1.r + (c2.r - c1.r) * t);
  const g = Math.round(c1.g + (c2.g - c1.g) * t);
  const b = Math.round(c1.b + (c2.b - c1.b) * t);

  return rgbToHex(r, g, b);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
