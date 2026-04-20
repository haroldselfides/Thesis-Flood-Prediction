"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import SpatialLayerLegend from "./SpatialLayerLegend";
import { useAppState, useAppDispatch } from "@/hooks/useAppState";
import {
  DEFAULT_MAP_VIEW,
  LEGAZPI_BOUNDS,
  SPATIAL_LAYERS,
  getHazardColor,
  LULC_CLASSES,
  GEOLOGY_CLASSES,
  STREET_ZOOM_THRESHOLD,
} from "@/lib/constants";
import HazardLegend from "./HazardLegend";
import ScaleBar from "./ScaleBar";
import { TILE_URL, TILE_ATTRIBUTION, MAX_ZOOM } from "@/lib/constants";


export default function MapContent() {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const layerGroupsRef = useRef<Record<string, L.Layer>>({});
  const hazardLayerRef = useRef<L.LayerGroup | null>(null);
  const barangayLayerRef = useRef<L.GeoJSON | null>(null);

  const state = useAppState();
  const dispatch = useAppDispatch();

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const container = mapContainerRef.current;
    if ((container as any)._leaflet_id) return;

    const map = L.map(container, {
      center: DEFAULT_MAP_VIEW.center,
      zoom: DEFAULT_MAP_VIEW.zoom,
      zoomControl: false,
      attributionControl: false,
      maxZoom: MAX_ZOOM,
    });

    // Basemap tile layer
    L.tileLayer(TILE_URL, {
      maxZoom: MAX_ZOOM,
      attribution: TILE_ATTRIBUTION,
    }).addTo(map);


    // Zoom control
    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Attribution control
    L.control
      .attribution({ position: "bottomleft", prefix: false })
      .addAttribution("Flood Hazard System — BU CS 2025")
      .addTo(map);

    // ✅ Native Leaflet scale bar — replaces the static ScaleBar component
    L.control.scale({
      position: "bottomleft",
      imperial: false,
      maxWidth: 120,
    }).addTo(map);

    map.fitBounds(LEGAZPI_BOUNDS, { padding: [20, 20] });

    mapRef.current = map;

    loadBarangayBoundaries(map, barangayLayerRef);

    // ✅ Zoom-based barangay fill toggle
    map.on("zoomend", () => {
      if (!barangayLayerRef.current) return;
      const z = map.getZoom();
      barangayLayerRef.current.setStyle({
        fillOpacity: z >= STREET_ZOOM_THRESHOLD ? 0 : 0,
        opacity:     z >= STREET_ZOOM_THRESHOLD ? 0.9 : 0.6,
        weight:      z >= STREET_ZOOM_THRESHOLD ? 2   : 1.5,
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      barangayLayerRef.current = null;
      if (mapContainerRef.current) {
        delete (mapContainerRef.current as any)._leaflet_id;
      }
    };
  }, []);

  // Handle spatial layer visibility changes
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    Object.entries(layerGroupsRef.current).forEach(([id, layer]) => {
      if (!state.visibleLayers.includes(id as any)) {
        map.removeLayer(layer);
        delete layerGroupsRef.current[id];
      }
    });

    state.visibleLayers.forEach((layerId) => {
      if (!layerGroupsRef.current[layerId]) {
        loadSpatialLayer(map, layerId, layerGroupsRef);
      }
    });
  }, [state.visibleLayers]);

  // Handle prediction results
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (hazardLayerRef.current) {
      map.removeLayer(hazardLayerRef.current);
      hazardLayerRef.current = null;
    }

    if (state.prediction) {
      renderHazardOverlay(map, state.prediction, hazardLayerRef);
    }
  }, [state.prediction]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="map-container" />

      {state.visibleLayers.filter((id) => id in SPATIAL_LAYERS).length > 0 ? (
        <SpatialLayerLegend />
      ) : (
        <HazardLegend />
      )}

      {/* ScaleBar is now handled by Leaflet's L.control.scale above */}
      {/* Remove <ScaleBar /> — it's been replaced by the native control */}

      {state.selectedBarangay && state.prediction && (
        <BarangayPopup
          barangayId={state.selectedBarangay}
          prediction={state.prediction}
          onClose={() => dispatch({ type: "SELECT_BARANGAY", payload: null })}
        />
      )}
    </div>
  );
}

// =============================================================================
// BARANGAY BOUNDARIES LOADER
// Now accepts barangayLayerRef so zoom handler can reference the layer
// =============================================================================

async function loadBarangayBoundaries(
  map: L.Map,
  barangayLayerRef: React.MutableRefObject<L.GeoJSON | null>
) {
  try {
    console.log("[MapContent] Fetching barangays.geojson...");
    const response = await fetch("/spatial/barangays.geojson");
    console.log("[MapContent] GeoJSON fetch status:", response.status, response.ok);

    if (!response.ok) {
      console.warn("[MapContent] Barangay boundaries not found — check /public/spatial/barangays.geojson");
      return;
    }

    const geojson = await response.json();
    console.log("[MapContent] GeoJSON loaded. Feature count:", geojson.features?.length);

    if (!geojson.features?.length) {
      console.warn("[MapContent] GeoJSON has no features.");
      return;
    }

    if (!map || map.getContainer() == null) {
      console.warn("[MapContent] Map was unmounted before GeoJSON could be added.");
      return;
    }

    const layer = L.geoJSON(geojson, {
      style: {
        color: "#0d4f7a",
        weight: 1.5,
        fillColor: "transparent",
        fillOpacity: 0,
        opacity: 0.6,
        dashArray: "4 2",
      },
      onEachFeature: (feature, layer) => {
        const label =
          feature.properties?.name ??
          feature.properties?.bgy_name ??
          feature.properties?.NAME ??
          feature.properties?.BGY_NAME;

        if (label) {
          layer.bindTooltip(label, {
            permanent: false,
            direction: "center",
            className: "barangay-tooltip",
          });
        }
      },
    }).addTo(map);

    // ✅ Store reference so zoom handler can call setStyle on it
    barangayLayerRef.current = layer;

    console.log("[MapContent] Barangay boundaries added to map.");
  } catch (e) {
    console.error("[MapContent] Could not load barangay boundaries:", e);
  }
}

// =============================================================================
// SPATIAL LAYER LOADER
// =============================================================================

async function loadSpatialLayer(
  map: L.Map,
  layerId: string,
  layerGroupsRef: React.MutableRefObject<Record<string, L.Layer>>
) {
  const layerConfig = SPATIAL_LAYERS[layerId as keyof typeof SPATIAL_LAYERS];
  if (!layerConfig) return;

  try {
    const parseGeoraster = (await import("georaster")).default;
    const GeoRasterLayer = (await import("georaster-layer-for-leaflet")).default;

    const response = await fetch(layerConfig.filePath);
    const arrayBuffer = await response.arrayBuffer();
    const georaster = await parseGeoraster(arrayBuffer);

    const layer = new GeoRasterLayer({
      georaster,
      opacity: layerConfig.opacity,
      resolution: 256,
      pixelValuesToColorFn: (values: number[]) => {
        const val = values[0];
        if (val === georaster.noDataValue || val === undefined || isNaN(val)) {
          return null;
        }

        if ((layerConfig as any).categorical) {
          const classCode = Math.round(val);
          if (layerId === "lulc")    return LULC_CLASSES[classCode]?.color    ?? null;
          if (layerId === "geology") return GEOLOGY_CLASSES[classCode]?.color ?? null;
          return null;
        }

        const [min, max] = layerConfig.valueRange;
        let normalized: number;

        if ((layerConfig as any).colorScale === "logarithmic") {
          const logMin = Math.log10(Math.max(1, min));
          const logMax = Math.log10(Math.max(1, max));
          const logVal = Math.log10(Math.max(1, val));
          normalized = (logVal - logMin) / (logMax - logMin);
        } else {
          normalized = (val - min) / (max - min);
        }

        normalized = Math.max(0, Math.min(1, normalized));
        return interpolateColorRamp(normalized, layerConfig.colorRamp);
      },
    });

    layer.addTo(map);

    layerGroupsRef.current = {
      ...layerGroupsRef.current,
      [layerId]: layer,
    };
  } catch (e) {
    console.warn(`[MapContent] Could not load spatial layer "${layerId}":`, e);
    console.info(`[MapContent] Ensure ${layerConfig.filePath} exists (export from QGIS as GeoTIFF EPSG:4326)`);
  }
}

// =============================================================================
// HAZARD COLOR HELPER
// =============================================================================

function floodProbToColor(prob: number): string {
  if (prob >= 0.75) return "#7c3aed"; // Very High — Purple
  if (prob >= 0.50) return "#dc2626"; // High      — Red
  if (prob >= 0.25) return "#f97316"; // Moderate  — Orange
  if (prob >= 0.10) return "#eab308"; // Low       — Yellow
  return "#22c55e";                   // Very Low  — Green
}

// =============================================================================
// HAZARD OVERLAY RENDERER
// =============================================================================

async function renderHazardOverlay(
  map: L.Map,
  prediction: any,
  hazardLayerRef: React.MutableRefObject<L.LayerGroup | null>
) {
  try {
    const response = await fetch("/spatial/barangays.geojson");
    if (!response.ok) return;
    const geojson = await response.json();

    const probMap = new Map<string, number>();

    if (prediction.barangays && prediction.flood_probability) {
      (prediction.barangays as string[]).forEach((name: string, i: number) => {
        probMap.set(name.toLowerCase(), prediction.flood_probability[i]);
      });
    } else if (prediction.barangayHazards) {
      prediction.barangayHazards.forEach((h: any) => {
        probMap.set(h.barangayName.toLowerCase(), h.floodProbability);
      });
    }

    const hazardLayer = L.geoJSON(geojson, {
      style: (feature) => {
        const name = (
          feature?.properties?.bgy_name ??
          feature?.properties?.name ??
          feature?.properties?.BGY_NAME ??
          feature?.properties?.NAME ??
          ""
        ).toLowerCase();

        const prob = probMap.get(name) ?? null;

        if (prob === null) {
          return { fillColor: "#cccccc", fillOpacity: 0.15, weight: 1, color: "#999", opacity: 0.4 };
        }

        const color = floodProbToColor(prob);
        return { fillColor: color, fillOpacity: 0.5, weight: 2, color, opacity: 0.8 };
      },
      onEachFeature: (feature, layer) => {
        const name =
          feature?.properties?.bgy_name ??
          feature?.properties?.name ??
          "Unknown";
        const prob = probMap.get(name.toLowerCase());
        layer.bindTooltip(
          `<strong>${name}</strong>${
            prob !== undefined ? `<br/>P(flood) = ${(prob * 100).toFixed(1)}%` : ""
          }`,
          { sticky: true }
        );
      },
    });

    hazardLayer.addTo(map);
    hazardLayerRef.current = hazardLayer as unknown as L.LayerGroup;
  } catch (e) {
    console.warn("[MapContent] Could not render hazard overlay:", e);
  }
}

// =============================================================================
// COLOR INTERPOLATION
// =============================================================================

function interpolateColorRamp(t: number, ramp: string[]): string {
  const idx = t * (ramp.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, ramp.length - 1);
  const frac = idx - lo;

  const parse = (hex: string) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  });

  const c1 = parse(ramp[lo]);
  const c2 = parse(ramp[hi]);

  return `rgb(${Math.round(c1.r + (c2.r - c1.r) * frac)}, ${Math.round(c1.g + (c2.g - c1.g) * frac)}, ${Math.round(c1.b + (c2.b - c1.b) * frac)})`;
}

// =============================================================================
// BARANGAY POPUP
// =============================================================================

function BarangayPopup({
  barangayId,
  prediction,
  onClose,
}: {
  barangayId: string;
  prediction: any;
  onClose: () => void;
}) {
  const brgy = prediction.barangayHazards?.find(
    (h: any) => h.barangayId === barangayId
  );
  if (!brgy) return null;

  const hazardColor = getHazardColor(brgy.hazardLevel);

  return (
    <div className="absolute top-4 right-4 z-[1000] bg-white rounded-xl shadow-xl border border-surface-3 w-72 animate-slide-up">
      <div className="p-3 border-b border-surface-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: hazardColor }} />
          <span className="font-display font-bold text-sm text-brand-900">
            {brgy.barangayName}
          </span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">
          ✕
        </button>
      </div>
      <div className="p-3 space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500">Flood Probability</span>
          <span className="font-bold" style={{ color: hazardColor }}>
            {Math.round(brgy.floodProbability * 100)}%
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Predicted Rainfall</span>
          <span className="font-semibold text-brand-900">{brgy.predictedRainfall} mm</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Predicted Water Level</span>
          <span className="font-semibold text-brand-900">
            {brgy.predictedWaterLevel ? `${brgy.predictedWaterLevel.toFixed(2)} m` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}