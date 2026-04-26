// =============================================================================
// SPATIAL DATA TYPES
// These types correspond to the 7 QGIS layers + basemap
// =============================================================================


/** CRS: EPSG:32651 (PRS92 / WGS84 UTM Zone 51N) */
export type CRS = "EPSG:32651" | "EPSG:4326";


/** Facility layer identifiers — matches the 5 GeoJSON facility files */
export type FacilityLayerId =
  | "fire_stations"
  | "hospitals"
  | "police_stations"
  | "schools"
  | "evacuation_centers";

/** Spatial layer identifiers — matches the 7 QGIS layers */
export type SpatialLayerId =
  | "flow_accumulation"
  | "rainfall_intensity"
  | "geology"
  | "lulc"
  | "slope"
  | "elevation"
  | "distance_from_river";

/** Metadata for a single raster/vector spatial layer */
export interface SpatialLayer {
  id: string;
  label: string;
  description: string;
  unit: string;
  source: string;
  filePath: string;
  valueRange: [number, number];
  colorRamp: string[];
  colorScale?: "linear" | "logarithmic"; 
  categorical: boolean;
  visible: boolean;
  opacity: number;
}

/** Barangay boundary feature */
export interface Barangay {
  id: string;
  name: string;
  /** GeoJSON geometry */
  geometry: GeoJSON.Geometry;
  /** Centroid for label placement */
  centroid: [number, number];
  /** Area in sq meters */
  area: number;
}

// =============================================================================
// FLOOD HAZARD TYPES
// =============================================================================

export type HazardLevel = "very_low" | "low" | "moderate" | "high" | "very_high";

export interface HazardClassification {
  level: HazardLevel;
  label: string;
  color: string;
  /** Probability range [min, max) */
  range: [number, number];
  description: string;
}

/** Per-barangay flood hazard result */
export interface BarangayHazard {
  barangayId: string;
  barangayName: string;
  hazardLevel: HazardLevel;
  /** Flood probability 0-1 */
  floodProbability: number;
  /** Predicted rainfall (mm) for the window */
  predictedRainfall: number;
  /** Predicted water level (m) if available */
  predictedWaterLevel?: number;
  /** Contributing factors ranked by importance */
  contributingFactors: {
    factor: SpatialLayerId;
    normalizedValue: number;
    contribution: number;
  }[];
}

// =============================================================================
// PREDICTION TYPES
// =============================================================================

/** Prediction time windows aligned with PAGASA recommendations */
export type PredictionWindow = "1h" | "3h" | "6h";

/** ECMWF forecast rainfall input */
export interface RainfallForecast {
  timestamp: string;
  /** Rainfall in mm */
  value: number;
  source: "ecmwf" | "gpm_imerg" | "pagasa_ground";
}

/** Torque Cluster assignment */
export interface RainfallCluster {
  clusterId: number;
  label: string;
  /** e.g., "Dry", "Light Rain", "Moderate", "Heavy", "Extreme" */
  regime: string;
  /** Representative centroid values */
  centroid: number[];
}

/** XGBoost prediction request */
export interface PredictionRequest {
  window: PredictionWindow;
  /** Recent rainfall observations (hourly, last 24h) */
  recentRainfall: number[];
  /** ECMWF forecast values for the window */
  forecastRainfall: number[];
  /** Torque cluster ID from clustering step */
  clusterId?: number;
}

/** XGBoost prediction response */
export interface PredictionResponse {
  window: PredictionWindow;
  timestamp: string;
  /** Per-barangay hazard results */
  barangayHazards: BarangayHazard[];
  /** City-wide summary */
  citySummary: {
    overallHazardLevel: HazardLevel;
    totalPredictedRainfall: number;
    predictedWaterLevel?: number;
    affectedBarangays: number;
    totalBarangays: number;
  };
  /** Model metadata */
  modelInfo: {
    version: string;
    accuracy: number;
    lastTrained: string;
  };
  /** System limitations disclosure (PAGASA recommendation) */
  limitations: string[];

}

// =============================================================================
// UI STATE TYPES
// =============================================================================

export interface MapViewState {
  center: [number, number];
  zoom: number;
}

export interface SidebarState {
  isOpen: boolean;
  activeTab: "layers" | "prediction" | "results" | "info";
}

export interface AppState {
  /** Currently active prediction window */
  predictionWindow: PredictionWindow;
  /** Which spatial layers are visible */
  visibleLayers: SpatialLayerId[];
  /** Which facility layers are visible */
  visibleFacilities: FacilityLayerId[];
  /** Current map view */
  mapView: MapViewState;
  /** Sidebar state */
  sidebar: SidebarState;
  /** Selected barangay (clicked on map) */
  selectedBarangay: string | null;
  /** Latest prediction results */
  prediction: PredictionResponse | null;
  /** Loading states */
  isLoading: boolean;
  isPredicting: boolean;
}

// =============================================================================
// API ROUTE TYPES
// =============================================================================

export interface ApiError {
  message: string;
  code: string;
  details?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: string;
}