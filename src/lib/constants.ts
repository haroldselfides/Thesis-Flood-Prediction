import type {
  SpatialLayer,
  SpatialLayerId,
  HazardClassification,
  HazardLevel,
  MapViewState,
} from "@/types";

// =============================================================================
// LEGAZPI CITY GEOGRAPHIC CONSTANTS
// =============================================================================
// src/lib/constants.ts
export const TILE_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
//export const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const LEGAZPI_CENTER: [number, number] = [13.1391, 123.7438];

export const DEFAULT_MAP_VIEW: MapViewState = {
  center: LEGAZPI_CENTER,
  zoom: 13,
};

export const LEGAZPI_BOUNDS: [[number, number], [number, number]] = [
  [13.08, 123.69],
  [13.21, 123.79],
];

export const ZOOM_LEVELS = {
  city:     { min: 10, max: 12 },
  barangay: { min: 13, max: 14 },
  street:   { min: 15, max: 16 },
  building: { min: 17, max: 19 },
} as const;

export const MIN_ZOOM = 10;
export const MAX_ZOOM = 19;
export const STREET_ZOOM_THRESHOLD = 15;

// =============================================================================
// LULC CLASSES
// Colors derived from guicadale_LULC_map.tif (dominant pixel colors)
// =============================================================================

export const LULC_CLASSES: Record<number, { label: string; color: string }> = {
  1: { label: "Open Forest / Mosaic Vegetation",    color: "#74c476" }, 
  2: { label: "Mangrove / Wetland Forest",     color: "#238b45" }, 
  3: { label: "Grassland / Shrubland",      color: "#d9f0a3" }, 
  4: { label: "Fishpond / Aquaculture", color: "#41b6c4" }, 
  5: { label: "Built-up / Residential Area",   color: "#e31a1c" }, 
  6: { label: "Water Body / Rivers / Lakes",         color: "#2171b5" }, 
  7: { label: "Barren Land / Exposed Soil",       color: "#bdbdbd" }, 
  8: { label: "Volcanic / Lava / Lahar",      color: "#7f3b08" }, 
  9: { label: "Agricultural / Cropland",      color: "#fec44f" }, 
  10: { label: "Perennial Crops / Plantation",      color: "#9e9ac8" }, 
  11: { label: "Closed Forest / Dense Vegetation",      color: "#005a32" }, 
};

// Colors derived from guicadale_geology_map.tif (dominant pixel colors)
export const GEOLOGY_CLASSES: Record<number, { label: string; color: string }> = {
  1: { label: "Quaternary",          color: "#18a97f" },
  2: { label: "Cretaceous-Paleocene",        color: "#874d2c" },
  3: { label: "Oligocene",   color: "#99d452" }, 
  4: { label: "Recent",             color: "#0e98ae" }, 
  5: { label: "Cretaceous-Paleogene",  color: "#8abfeb" }, 
  6: { label: "Oligocene-Miocene",       color: "#3b3c90" },
  7: { label: "Upper Miocene-Pliocene",       color: "#148e27" }, 
};

// Colors derived from guicadale_distance_from_rivers_map.tif
// Layer is rendered as classified bands; class boundaries based on original metadata
export const DISTANCE_FROM_RIVER_CLASSES: Record<number, { label: string; color: string }> = {
  0: { label: "0 – 823.2 m",        color: "#045a8d" }, // darkest blue  (closest to river)
  1: { label: "823.2 – 1,646.4 m",  color: "#2382b4" }, // medium-dark blue
  2: { label: "1,646.4 – 2,469.6 m",color: "#579dc8" }, // medium blue
  3: { label: "2,469.6 – 3,292.8 m",color: "#91b6d6" }, // light blue
  4: { label: "3,292.8 – 4,116.0 m",color: "#c7d0e5" }, // very light blue (farthest)
};

// =============================================================================
// FLOW DIRECTION CLASSES
// Colors derived from guicadale_flow_direction_map.tif (RdYlGn-style palette)
// D8 encoding: 1=E, 2=SE, 4=S, 8=SW, 16=W, 32=NW, 64=N, 128=NE
// =============================================================================

// export const FLOW_DIRECTION_CLASSES: Record<number, { label: string; color: string }> = {
//   1:   { label: "East",       color: "#a50026" }, // dark red
//   2:   { label: "Southeast",  color: "#ff7f00" }, // orange
//   4:   { label: "South",      color: "#ffffbf" }, // pale yellow
//   8:   { label: "Southwest",  color: "#e6f598" }, // yellow-green
//   16:  { label: "West",       color: "#abdda4" }, // light green
//   32:  { label: "Northwest",  color: "#66c2a5" }, // teal green
//   64:  { label: "North",      color: "#3288bd" }, // blue
//   128: { label: "Northeast",  color: "#5e4fa2" }, // purple
// };

// =============================================================================
// SPATIAL LAYERS
// =============================================================================

export const SPATIAL_LAYERS: Record<SpatialLayerId, SpatialLayer> = {
flow_accumulation: {
  id: "flow_accumulation",
  label: "Flow Accumulation",
  description: "Measures upstream contributing cells indicating drainage concentration.",
  unit: "pixel count",
  source: "Derived from DEM",
  filePath: "/spatial/guicadale_flow_accumulation.tif",
  valueRange: [0, 99031],
  colorRamp: ["#ffff00", "#00ff00", "#00ffff", "#0000ff", "#000000"],
  // ADD THIS:
  colorScale: "logarithmic",   // tell your renderer to apply log10 stretch
  categorical: false,
  visible: false,
  opacity: 0.7,
},

  rainfall_intensity: {
    id: "rainfall_intensity",
    label: "Rainfall Intensity",
    description:
      "Spatial rainfall distribution from satellite-based IMERG data.",
    unit: "mm/hr",
    source: "GPM IMERG",
    filePath: "/spatial/guicadale_rainfall_intensity.tif",
    valueRange: [0, 100],
    colorRamp: ["#ffffcc", "#fd8d3c", "#800026"],
    categorical: false,
    visible: false,
    opacity: 0.7,
  },

  geology: {
    id: "geology",
    label: "Geology (Lithology)",
    description: "Geological classification layer.",
    unit: "class",
    source: "Geological survey data",
    filePath: "/spatial/guicadale_geology.tif",
    valueRange: [1, 6],
    colorRamp: [],
    categorical: true,
    visible: false,
    opacity: 0.7,
  },

  lulc: {
    id: "lulc",
    label: "Land Use / Land Cover",
    description:
      "Urban and natural land cover classification affecting infiltration.",
    unit: "class",
    source: "NAMRIA LULC data",
    filePath: "/spatial/guicadale_lulc.tif",
    valueRange: [10, 95],
    colorRamp: [],
    categorical: true,
    visible: false,
    opacity: 0.7,
  },

  slope: {
    id: "slope",
    label: "Slope",
    description:
      "Terrain slope influencing runoff speed and accumulation.",
    unit: "degrees",
    source: "Derived from DEM",
    filePath: "/spatial/guicadale_slope.tif",
    valueRange: [0, 50.1406174],
    // Ramp: dark navy (flat) → dark olive → bright yellow (steep)
    // Derived from guicadale_slope_map.tif (viridis-inspired dark palette)
    colorRamp: ["#00204d", "#0c376e", "#444f6b", "#646770", "#828079","#a29a76","#c6b66b","#e8d259","#ffea46"],
    categorical: false,
    visible: false,
    opacity: 0.7,
  },

  elevation: {
    id: "elevation",
    label: "Elevation (DEM)",
    description:
      "Terrain elevation influencing flood susceptibility.",
    unit: "meters",
    source: "SRTM / ALOS DEM",
    filePath: "/spatial/guicadale_elevation.tif",
    valueRange: [0, 2376.95996],
    // Ramp: deep blue (low) → light steel blue → pale blue-gray (high)
    // Derived from guicadale_elevation_map.tif dominant gradient colors
    colorRamp: ["#c7d0e5", "#91b6d6", "#579dc8", "#2382b4", "#045a8d"],
    categorical: false,
    visible: false,
    opacity: 0.6,
  },

  distance_from_river: {
    id: "distance_from_river",
    label: "Distance from River",
    description:
      "Proximity to river channels affecting flood exposure.",
    unit: "meters",
    source: "Hydro network data",
    filePath: "/spatial/guicadale_rivers.tif",
    valueRange: [0, 4116],
    // Ramp mirrors DISTANCE_FROM_RIVER_CLASSES: dark blue (near) → pale blue (far)
    colorRamp: ["#045a8d", "#2382b4", "#579dc8", "#91b6d6", "#c7d0e5"],
    categorical: false,
    visible: false,
    opacity: 0.7,
  },
};

// =============================================================================
// HAZARD CLASSIFICATION
// =============================================================================

export const HAZARD_CLASSIFICATIONS: HazardClassification[] = [
  {
    level: "very_low",
    label: "Very Low",
    color: "#2ecc71",
    range: [0, 0.2],
    description: "Minimal flood risk.",
  },
  {
    level: "low",
    label: "Low",
    color: "#f1c40f",
    range: [0.2, 0.4],
    description: "Low flood risk.",
  },
  {
    level: "moderate",
    label: "Moderate",
    color: "#e67e22",
    range: [0.4, 0.6],
    description: "Moderate flood risk.",
  },
  {
    level: "high",
    label: "High",
    color: "#e74c3c",
    range: [0.6, 0.8],
    description: "High flood risk.",
  },
  {
    level: "very_high",
    label: "Very High",
    color: "#8e44ad",
    range: [0.8, 1.0],
    description: "Very high flood risk.",
  },
];

export function getHazardClassification(probability: number): HazardClassification {
  return (
    HAZARD_CLASSIFICATIONS.find(
      (h) => probability >= h.range[0] && probability < h.range[1]
    ) ?? HAZARD_CLASSIFICATIONS[HAZARD_CLASSIFICATIONS.length - 1]
  );
}

export function getHazardColor(level: HazardLevel): string {
  return HAZARD_CLASSIFICATIONS.find((h) => h.level === level)?.color ?? "#999";
}

// =============================================================================
// PREDICTION WINDOWS
// =============================================================================

export const PREDICTION_WINDOWS = [
  { value: "1h" as const, label: "1 Hour", description: "Short-term risk" },
  { value: "3h" as const, label: "3 Hours", description: "Near-term risk" },
  { value: "6h" as const, label: "6 Hours", description: "Extended outlook" },
];