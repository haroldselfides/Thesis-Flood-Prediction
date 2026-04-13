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

export const LEGAZPI_CENTER: [number, number] = [13.1391, 123.7438];

export const DEFAULT_MAP_VIEW: MapViewState = {
  center: LEGAZPI_CENTER,
  zoom: 13,
};

export const LEGAZPI_BOUNDS: [[number, number], [number, number]] = [
  [13.08, 123.69],
  [13.21, 123.79],
];

// =============================================================================
// LULC CLASSES
// =============================================================================

export const LULC_CLASSES: Record<number, { label: string; color: string }> = {
  10: { label: "Tree Cover", color: "#1b7837" },
  30: { label: "Grassland", color: "#a6db8d" },
  40: { label: "Cropland", color: "#ffffb3" },
  50: { label: "Built-Up", color: "#c0c0c0" },
  60: { label: "Bare/Sparse", color: "#d2b48c" },
  80: { label: "Water", color: "#aa64ef" },
  90: { label: "Wetland", color: "#a6cee3" },
  95: { label: "Mangrove", color: "#006837" },
};

export const GEOLOGY_CLASSES: Record<number, { label: string; color: string }> = {
  1: { label: "Quaternary Alluvium", color: "#000004" },
  2: { label: "Mayon Volcanic Complex", color: "#3b0f6f" },
  3: { label: "Mayon Volcanic Pyroclastics", color: "#8c2981" },
  4: { label: "Polangui Andesite", color: "#dd4a69" },
  5: { label: "Pocdol Volcanic Pyroclastics", color: "#fe9f6d" },
  6: { label: "Pocdol Volcanic Complex", color: "#fcfdbf" },
};

export const DISTANCE_FROM_RIVER_CLASSES: Record<number, { label: string; color: string }> = {
  0: { label: "0 – 823.2m", color: "#b4e1b9" },
  1: { label: "823.2 – 1,646.4m", color: "#aec4ae" },
  2: { label: "1,646.4 – 2,469.6m", color: "#39a0bf" },
  3: { label: "2,469.6 – 3,292.8m", color: "#2b70b1" },
  4: { label: "3,292.8 – 4,116.0m", color: "#253494" },
};

// =============================================================================
// SPATIAL LAYERS
// =============================================================================

export const SPATIAL_LAYERS: Record<SpatialLayerId, SpatialLayer> = {
  flow_accumulation: {
    id: "flow_accumulation",
    label: "Flow Accumulation",
    description:
      "Measures upstream contributing cells indicating drainage concentration.",
    unit: "pixel count",
    source: "Derived from DEM",
    filePath: "/spatial/flow_accumulation.tif",
    valueRange: [0, 100000],
    colorRamp: ["#fff5f0", "#67000d"],
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
    filePath: "/spatial/rainfall_intensity.tif",
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
    filePath: "/spatial/geology.tif",
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
    filePath: "/spatial/lulc.tif",
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
    filePath: "/spatial/slope.tif",
    valueRange: [0, 60],
    colorRamp: ["#30123b", "#28bceb", "#a4fc3c", "#fb7e21", "#7a0403"],
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
    filePath: "/spatial/elevation.tif",
    valueRange: [0, 2402],
    colorRamp: ["#3e9cfe", "#48f882", "#e2dc38", "#ef5911"],
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
    filePath: "/spatial/distance_from_river.tif",
    valueRange: [0, 5000],
    colorRamp: ["#b4e1b9", "#aec4ae", "#39a0bf", "#2b70b1", "#253494"],
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