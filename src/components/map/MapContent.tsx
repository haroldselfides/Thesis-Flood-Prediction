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
} from "@/lib/constants";
import HazardLegend from "./HazardLegend";
import ScaleBar from "./ScaleBar";

// Flood hazard level color mapping (matches legend in image):
// Very Low  → Green   (#22c55e)  prob < 0.10
// Low       → Yellow  (#eab308)  prob 0.10–0.25
// Moderate  → Orange  (#f97316)  prob 0.25–0.50
// High      → Red     (#dc2626)  prob 0.50–0.75
// Very High → Purple  (#7c3aed)  prob >= 0.75

export default function MapContent() {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const layerGroupsRef = useRef<Record<string, L.Layer>>({});
  const hazardLayerRef = useRef<L.LayerGroup | null>(null);

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
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      }
    ).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    L.control
      .attribution({ position: "bottomleft", prefix: false })
      .addAttribution("Flood Hazard System — BU CS 2025")
      .addTo(map);

    map.fitBounds(LEGAZPI_BOUNDS, { padding: [20, 20] });

    mapRef.current = map;

    loadBarangayBoundaries(map);

    return () => {
      map.remove();
      mapRef.current = null;
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

      <ScaleBar />

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

async function loadBarangayBoundaries(map: L.Map) {
  try {
    const response = await fetch("/spatial/barangays.geojson");
    if (!response.ok) {
      console.warn("Barangay boundaries not found.");
      return;
    }
    const geojson = await response.json();

    try {
      map.getContainer();
    } catch {
      return;
    }
    if (!map.getPane("overlayPane")) return;

    L.geoJSON(geojson, {
      style: {
        color: "#0d4f7a",
        weight: 1.5,
        fillColor: "transparent",
        fillOpacity: 0,
        opacity: 0.6,
        dashArray: "4 2",
      },
      onEachFeature: (feature, layer) => {
        if (feature.properties?.name) {
          layer.bindTooltip(feature.properties.name, {
            permanent: false,
            direction: "center",
            className: "barangay-tooltip",
          });
        }
      },
    }).addTo(map);
  } catch (e) {
    console.warn("Could not load barangay boundaries:", e);
  }
}

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
          if (layerId === "lulc") return LULC_CLASSES[classCode]?.color ?? null;
          if (layerId === "geology") return GEOLOGY_CLASSES[classCode]?.color ?? null;
          return null;
        }

        const [min, max] = layerConfig.valueRange;
        const normalized = Math.max(0, Math.min(1, (val - min) / (max - min)));
        return interpolateColorRamp(normalized, layerConfig.colorRamp);
      },
    });

    layer.addTo(map);

    layerGroupsRef.current = {
      ...layerGroupsRef.current,
      [layerId]: layer,
    };
  } catch (e) {
    console.warn(`Could not load spatial layer ${layerId}:`, e);
    console.info(`Ensure ${layerConfig.filePath} exists (export from QGIS as GeoTIFF EPSG:4326)`);
  }
}

/**
 * Returns the fill color for a given flood probability using the
 * 5-tier hazard legend:
 *
 *  prob >= 0.75  → Very High → Purple  #7c3aed
 *  prob >= 0.50  → High      → Red     #dc2626
 *  prob >= 0.25  → Moderate  → Orange  #f97316
 *  prob >= 0.10  → Low       → Yellow  #eab308
 *  prob <  0.10  → Very Low  → Green   #22c55e
 */
function floodProbToColor(prob: number): string {
  if (prob >= 0.75) return "#7c3aed"; // Very High — Purple
  if (prob >= 0.50) return "#dc2626"; // High      — Red
  if (prob >= 0.25) return "#f97316"; // Moderate  — Orange
  if (prob >= 0.10) return "#eab308"; // Low       — Yellow
  return "#22c55e";                   // Very Low  — Green
}

async function renderHazardOverlay(
  map: L.Map,
  prediction: any,
  hazardLayerRef: React.MutableRefObject<L.LayerGroup | null>
) {
  try {
    const response = await fetch("/spatial/barangays.geojson");
    if (!response.ok) return;
    const geojson = await response.json();

    // Build lookup: lowercase barangay name → probability
    const probMap = new Map<string, number>();

    if (prediction.barangays && prediction.flood_probability) {
      // Real FastAPI format
      (prediction.barangays as string[]).forEach((name: string, i: number) => {
        probMap.set(name.toLowerCase(), prediction.flood_probability[i]);
      });
    } else if (prediction.barangayHazards) {
      // Mock format fallback
      prediction.barangayHazards.forEach((h: any) => {
        probMap.set(h.barangayName.toLowerCase(), h.floodProbability);
      });
    }

    const hazardLayer = L.geoJSON(geojson, {
      style: (feature) => {
        // GeoJSON uses "bgy_name" property
        const name = (feature?.properties?.bgy_name ?? "").toLowerCase();
        const prob = probMap.get(name) ?? null;

        if (prob === null) {
          return {
            fillColor: "#cccccc",
            fillOpacity: 0.15,
            weight: 1,
            color: "#999",
            opacity: 0.4,
          };
        }

        const color = floodProbToColor(prob);

        return {
          fillColor: color,
          fillOpacity: 0.5,
          weight: 2,
          color: color,
          opacity: 0.8,
        };
      },
      onEachFeature: (feature, layer) => {
        const name = feature?.properties?.bgy_name ?? "Unknown";
        const prob = probMap.get(name.toLowerCase());
        layer.bindTooltip(
          `<strong>${name}</strong>${
            prob !== undefined
              ? `<br/>P(flood) = ${(prob * 100).toFixed(1)}%`
              : ""
          }`,
          { sticky: true }
        );
      },
    });

    hazardLayer.addTo(map);
    hazardLayerRef.current = hazardLayer as unknown as L.LayerGroup;
  } catch (e) {
    console.warn("Could not render hazard overlay:", e);
  }
}

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

  const r = Math.round(c1.r + (c2.r - c1.r) * frac);
  const g = Math.round(c1.g + (c2.g - c1.g) * frac);
  const b = Math.round(c1.b + (c2.b - c1.b) * frac);

  return `rgb(${r}, ${g}, ${b})`;
}

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