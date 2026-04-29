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
  geometry: GeoJSON.Geometry;
  centroid: [number, number];
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
  range: [number, number];
  description: string;
}

/** Per-barangay flood hazard result */
export interface BarangayHazard {
  barangayId: string;
  barangayName: string;
  hazardLevel: HazardLevel;
  floodProbability: number;
  predictedRainfall: number;
  predictedWaterLevel?: number;
  contributingFactors: {
    factor: SpatialLayerId;
    normalizedValue: number;
    contribution: number;
  }[];
}

// =============================================================================
// PREDICTION TYPES
// =============================================================================

export type PredictionWindow = "1h" | "3h" | "6h";

export interface RainfallForecast {
  timestamp: string;
  value: number;
  source: "ecmwf" | "gpm_imerg" | "pagasa_ground";
}

export interface RainfallCluster {
  clusterId: number;
  label: string;
  regime: string;
  centroid: number[];
}

export interface PredictionRequest {
  window: PredictionWindow;
  recentRainfall: number[];
  forecastRainfall: number[];
  clusterId?: number;
}

/** Per-point entry in barangay_results (averaged per barangay by backend) */
export interface BarangayResult {
  barangay: string;
  flood_probability: number;
  flood_label: "Low" | "Moderate" | "High" | "Critical";
  point_count: number;
}

/** XGBoost prediction response */
export interface PredictionResponse {
  window: PredictionWindow;
  timestamp: string;
  barangayHazards: BarangayHazard[];
  citySummary: {
    overallHazardLevel: HazardLevel;
    totalPredictedRainfall: number;
    predictedWaterLevel?: number;
    affectedBarangays: number;
    totalBarangays: number;
  };
  modelInfo: {
    version: string;
    accuracy: number;
    lastTrained: string;
  };
  limitations: string[];

  // ── Per-point pipeline fields ─────────────────────────────────────────────
  points_geojson?: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      geometry: { type: "Point"; coordinates: [number, number] };
      properties: {
        point_id: number;
        flood_probability: number;
        flood_label: string;
      };
    }>;
  };
  barangay_results?: BarangayResult[];
  metadata?: {
    rain_1hr_mm: number;
    rain_3hr_mm: number;
    rain_6hr_mm: number;
    rain_72h_prior: number;
    tc_regime: string;
    is_fallback: boolean;
    point_count: number;
    dry_run: boolean;
    scale_factor: number;
    simulated?: boolean;
  };
  simulated?: boolean;
  stale_forecast?: boolean;
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
  predictionWindow: PredictionWindow;
  visibleLayers: SpatialLayerId[];
  visibleFacilities: FacilityLayerId[];
  mapView: MapViewState;
  sidebar: SidebarState;
  selectedBarangay: string | null;
  prediction: PredictionResponse | null;
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
