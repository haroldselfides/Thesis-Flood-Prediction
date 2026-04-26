"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useAppState, useAppDispatch } from "@/hooks/useAppState";
import {
  DEFAULT_MAP_VIEW,
  LEGAZPI_BOUNDS,
  STREET_ZOOM_THRESHOLD,
  SPATIAL_LAYERS,
  LULC_CLASSES,
  GEOLOGY_CLASSES,
  getHazardColor,
} from "@/lib/constants";
import HazardLegend from "./HazardLegend";
import SpatialLayerLegend from "./SpatialLayerLegend";
import type { FacilityLayerId } from "@/types";

// =============================================================================
// FACILITY LAYERS CONFIG
// =============================================================================

export const FACILITY_LAYERS: Record<
  FacilityLayerId,
  { label: string; color: string; icon: string; filePath: string }
> = {
  hospitals: {
    label: "Hospitals / Health Centers",
    color: "#ef4444",
    icon: "🏥",
    filePath: "/facilities/hospitals.geojson",
  },
  evacuation_centers: {
    label: "Evacuation Centers",
    color: "#3b82f6",
    icon: "🏠",
    filePath: "/facilities/evacuation_centers.geojson",
  },
  schools: {
    label: "Schools",
    color: "#f59e0b",
    icon: "🏫",
    filePath: "/facilities/schools.geojson",
  },
  police_stations: {
    label: "Police Stations",
    color: "#1d4ed8",
    icon: "🚔",
    filePath: "/facilities/police_stations.geojson",
  },
  fire_stations: {
    label: "Fire Stations",
    color: "#f97316",
    icon: "🚒",
    filePath: "/facilities/fire_stations.geojson",
  },
};

// =============================================================================
// TYPES
// =============================================================================

interface SelectedFacility {
  type: FacilityLayerId;
  name: string;
  address: string;
  floodProb: number | null;
  lngLat: [number, number];
}

interface NearestResult {
  type: FacilityLayerId;
  name: string;
  address: string;
  distanceM: number;
  lngLat: [number, number];
  floodProb: number | null;
}

interface RouteInfo {
  distanceM: number;
  durationS: number;
  steps: { instruction: string; distanceM: number }[];
}

interface ActiveRoute {
  coords: [number, number];
  name: string;
  type: FacilityLayerId;
}

type GpsStatus = "idle" | "locating" | "located" | "error";

// =============================================================================
// HAVERSINE DISTANCE (meters)
// =============================================================================

function haversineMeters(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number]
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function formatDuration(s: number): string {
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

// =============================================================================
// OSRM STEP FORMATTER
// =============================================================================

function formatOsrmStep(step: any): string {
  const type = step.maneuver?.type ?? "";
  const modifier = step.maneuver?.modifier ?? "";
  const name = step.name ? `onto ${step.name}` : "";
  if (type === "depart") return `Head ${modifier} ${name}`.trim();
  if (type === "arrive") return "Arrive at destination";
  if (type === "turn") return `Turn ${modifier} ${name}`.trim();
  if (type === "roundabout") return `Enter roundabout ${name}`.trim();
  if (type === "continue") return `Continue ${modifier} ${name}`.trim();
  if (type === "merge") return `Merge ${modifier} ${name}`.trim();
  if (type === "fork") return `Keep ${modifier} at fork ${name}`.trim();
  if (type === "on ramp") return `Take ramp ${modifier} ${name}`.trim();
  if (type === "off ramp") return `Take exit ${modifier} ${name}`.trim();
  return `${type} ${modifier} ${name}`.trim() || "Continue";
}

function stepIcon(instruction: string): string {
  const i = instruction.toLowerCase();
  if (i.includes("arrive")) return "📍";
  if (i.includes("head") || i.includes("depart")) return "⬆️";
  if (i.includes("sharp left")) return "↰";
  if (i.includes("sharp right")) return "↱";
  if (i.includes("slight left") || i.includes("keep left")) return "↖️";
  if (i.includes("slight right") || i.includes("keep right")) return "↗️";
  if (i.includes("left")) return "⬅️";
  if (i.includes("right")) return "➡️";
  if (i.includes("roundabout") || i.includes("rotary")) return "🔄";
  if (i.includes("u-turn")) return "↩️";
  if (i.includes("merge")) return "🔀";
  if (i.includes("continue") || i.includes("straight")) return "⬆️";
  return "⬆️";
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function MapContent() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedLayersRef = useRef<Set<string>>(new Set());
  const loadedFacilitiesRef = useRef<Set<FacilityLayerId>>(new Set());
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const mapReadyRef = useRef(false);
  const barangaysReadyRef = useRef(false);
  const facilityDataCacheRef = useRef<Map<FacilityLayerId, any[]>>(new Map());

  // Local UI state
  const [selectedFacility, setSelectedFacility] = useState<SelectedFacility | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("idle");
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [nearestResults, setNearestResults] = useState<NearestResult[]>([]);
  const [showNearestPanel, setShowNearestPanel] = useState(false);

  // Route state
  const [activeRoute, setActiveRoute] = useState<ActiveRoute | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  const state = useAppState();
  const dispatch = useAppDispatch();
  const visibleFacilities: FacilityLayerId[] = state.visibleFacilities ?? [];

  // ===========================================================================
  // INITIALIZE MAP
  // ===========================================================================
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [DEFAULT_MAP_VIEW.center[1], DEFAULT_MAP_VIEW.center[0]],
      zoom: DEFAULT_MAP_VIEW.zoom,
      pitch: 45,
      bearing: -17.6,
    });

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", () => {
      const style = map.getStyle();
      if (style?.layers) {
        style.layers.forEach((layer) => {
          if (layer.type === "fill-extrusion") {
            const paint = (layer as any).paint ?? {};
            const wrapCoalesce = (expr: any): any => {
              if (!expr || typeof expr !== "object") return expr;
              if (
                Array.isArray(expr) &&
                expr[0] === "get" &&
                (expr[1] === "render_height" || expr[1] === "render_min_height")
              ) {
                return ["coalesce", expr, 0];
              }
              return Array.isArray(expr) ? expr.map(wrapCoalesce) : expr;
            };
            if (paint["fill-extrusion-height"])
              map.setPaintProperty(layer.id, "fill-extrusion-height", wrapCoalesce(paint["fill-extrusion-height"]));
            if (paint["fill-extrusion-base"])
              map.setPaintProperty(layer.id, "fill-extrusion-base", wrapCoalesce(paint["fill-extrusion-base"]));
            if (paint["fill-extrusion-color"])
              map.setPaintProperty(layer.id, "fill-extrusion-color", wrapCoalesce(paint["fill-extrusion-color"]));
          }
        });
      }

      map.fitBounds(
        [
          [LEGAZPI_BOUNDS[0][1], LEGAZPI_BOUNDS[0][0]],
          [LEGAZPI_BOUNDS[1][1], LEGAZPI_BOUNDS[1][0]],
        ],
        { padding: 40, pitch: 45, duration: 1200 }
      );

      map.addLayer({
        id: "3d-buildings",
        source: "openmaptiles",
        "source-layer": "building",
        type: "fill-extrusion",
        minzoom: 14,
        paint: {
          "fill-extrusion-color": [
            "interpolate", ["linear"],
            ["coalesce", ["get", "render_height"], 0],
            0, "#e8dcc8", 50, "#d4c5a9", 100, "#b8a88a", 200, "#9c8b6e",
          ],
          "fill-extrusion-height": [
            "interpolate", ["linear"], ["zoom"],
            14, 0, 16, ["coalesce", ["get", "render_height"], 0],
          ],
          "fill-extrusion-base": [
            "interpolate", ["linear"], ["zoom"],
            14, 0, 16, ["coalesce", ["get", "render_min_height"], 0],
          ],
          "fill-extrusion-opacity": 0.85,
        },
      });

      mapReadyRef.current = true;
      loadBarangayBoundaries(map).then(() => {
        barangaysReadyRef.current = true;
        map.fire("barangays-ready");
      });
    });

    map.on("zoom", () => {
      const z = map.getZoom();
      if (map.getLayer("barangay-fill"))
        map.setPaintProperty("barangay-fill", "fill-opacity", z >= STREET_ZOOM_THRESHOLD ? 0 : 0.08);
      if (map.getLayer("barangay-outline"))
        map.setPaintProperty("barangay-outline", "line-opacity", z >= STREET_ZOOM_THRESHOLD ? 0.9 : 0.6);
    });

    mapRef.current = map;
    return () => {
      mapReadyRef.current = false;
      barangaysReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ===========================================================================
  // SPATIAL LAYERS
  // ===========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applyLayers = () => {
      if (!mapReadyRef.current) return;
      loadedLayersRef.current.forEach((layerId) => {
        if (!state.visibleLayers.includes(layerId as any)) {
          const sourceId = `raster-source-${layerId}`;
          const layerGlId = `raster-layer-${layerId}`;
          if (map.getLayer(layerGlId)) map.removeLayer(layerGlId);
          if (map.getSource(sourceId)) map.removeSource(sourceId);
          loadedLayersRef.current.delete(layerId);
        }
      });
      state.visibleLayers.forEach((layerId) => {
        if (layerId in SPATIAL_LAYERS && !loadedLayersRef.current.has(layerId))
          loadSpatialLayer(map, layerId, loadedLayersRef);
      });
    };
    if (map.isStyleLoaded() && mapReadyRef.current) applyLayers();
    else { map.once("load", applyLayers); map.once("barangays-ready" as any, applyLayers); }
  }, [state.visibleLayers]);

  // ===========================================================================
  // HAZARD OVERLAY
  // ===========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applyHazard = () => {
      if (map.getLayer("hazard-fill")) map.removeLayer("hazard-fill");
      if (map.getLayer("hazard-outline")) map.removeLayer("hazard-outline");
      if (map.getSource("hazard-source")) map.removeSource("hazard-source");
      if (state.prediction) renderHazardOverlay(map, state.prediction);
    };
    if (map.isStyleLoaded()) applyHazard();
    else map.once("load", applyHazard);
  }, [state.prediction]);

  // ===========================================================================
  // FACILITY LAYERS
  // ===========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyFacilities = () => {
      if (!mapReadyRef.current) return;
      loadedFacilitiesRef.current.forEach((facilityType) => {
        if (!visibleFacilities.includes(facilityType)) {
          const sourceId = `facility-source-${facilityType}`;
          const circleId = `facility-circle-${facilityType}`;
          const labelId = `facility-label-${facilityType}`;
          if (map.getLayer(labelId)) map.removeLayer(labelId);
          if (map.getLayer(circleId)) map.removeLayer(circleId);
          if (map.getSource(sourceId)) map.removeSource(sourceId);
          loadedFacilitiesRef.current.delete(facilityType);
          setSelectedFacility((prev) => prev?.type === facilityType ? null : prev);
        }
      });
      visibleFacilities.forEach((facilityType) => {
        if (!loadedFacilitiesRef.current.has(facilityType)) {
          loadFacilityLayer(
            map, facilityType, loadedFacilitiesRef,
            facilityDataCacheRef, state.prediction,
            (facility) => setSelectedFacility(facility)
          );
        }
      });
    };

    if (map.isStyleLoaded() && mapReadyRef.current) applyFacilities();
    else map.once("barangays-ready" as any, applyFacilities);
  }, [visibleFacilities, state.prediction]);

  // ===========================================================================
  // DRAW ROUTE
  // ===========================================================================
  const drawRoute = useCallback(async (
    from: [number, number],
    to: [number, number],
    facilityName: string,
    facilityType: FacilityLayerId
  ) => {
    const map = mapRef.current;
    if (!map) return;

    setRouteLoading(true);
    setRouteInfo(null);
    setActiveRoute(null);

    // Clear old route layers
    if (map.getLayer("route-line")) map.removeLayer("route-line");
    if (map.getLayer("route-casing")) map.removeLayer("route-casing");
    if (map.getLayer("route-arrows")) map.removeLayer("route-arrows");
    if (map.getSource("route")) map.removeSource("route");

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson&steps=true`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.code !== "Ok" || !data.routes?.length) {
        setRouteLoading(false);
        return;
      }

      const route = data.routes[0];
      const geom = route.geometry;
      const steps: { instruction: string; distanceM: number }[] = route.legs[0].steps.map((s: any) => ({
        instruction: s.maneuver?.instruction ?? formatOsrmStep(s),
        distanceM: s.distance,
      }));

      setRouteInfo({ distanceM: route.distance, durationS: route.duration, steps });
      setActiveRoute({ coords: to, name: facilityName, type: facilityType });

      map.addSource("route", {
        type: "geojson",
        data: { type: "Feature", geometry: geom, properties: {} },
      });

      // White casing (outline for contrast)
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 10, "line-opacity": 0.9 },
      });

      // Main blue route line
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#2563eb",
          "line-width": 6,
          "line-opacity": 0.95,
        },
      });

      // Fit bounds to show full route
      const coords = geom.coordinates as [number, number][];
      const lngs = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: { top: 80, bottom: 320, left: 40, right: 320 }, duration: 1000 }
      );
    } catch (e) {
      console.warn("[MapContent] Route fetch failed:", e);
    } finally {
      setRouteLoading(false);
    }
  }, []);

  // ===========================================================================
  // CLEAR ROUTE
  // ===========================================================================
  const clearRoute = useCallback(() => {
    const map = mapRef.current;
    if (map) {
      if (map.getLayer("route-line")) map.removeLayer("route-line");
      if (map.getLayer("route-casing")) map.removeLayer("route-casing");
      if (map.getLayer("route-arrows")) map.removeLayer("route-arrows");
      if (map.getSource("route")) map.removeSource("route");
    }
    setActiveRoute(null);
    setRouteInfo(null);
  }, []);

  // ===========================================================================
  // GPS LOCATE
  // ===========================================================================
  const handleGpsLocate = useCallback(async () => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser.");
      setGpsStatus("error");
      return;
    }

    setGpsStatus("locating");
    setGpsError(null);
    setNearestResults([]);
    setShowNearestPanel(false);
    clearRoute();

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const userCoords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setUserLocation(userCoords);
        setGpsStatus("located");

        const map = mapRef.current;
        if (map) {
          if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null; }

          const el = document.createElement("div");
          el.style.cssText = `
            width: 20px; height: 20px; border-radius: 50%;
            background: #2563eb; border: 3px solid #fff;
            box-shadow: 0 0 0 4px rgba(37,99,235,0.3);
            animation: gps-pulse 1.5s infinite;
          `;
          if (!document.getElementById("gps-pulse-style")) {
            const s = document.createElement("style");
            s.id = "gps-pulse-style";
            s.textContent = `@keyframes gps-pulse {
              0%   { box-shadow: 0 0 0 0 rgba(37,99,235,0.4); }
              70%  { box-shadow: 0 0 0 10px rgba(37,99,235,0); }
              100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); }
            }`;
            document.head.appendChild(s);
          }
          userMarkerRef.current = new maplibregl.Marker({ element: el })
            .setLngLat(userCoords).addTo(map);
          map.flyTo({ center: userCoords, zoom: 15, pitch: 45, duration: 1200 });
        }

        await findNearestFacilities(userCoords, facilityDataCacheRef, state.prediction, setNearestResults);
        setShowNearestPanel(true);
      },
      (err) => {
        setGpsStatus("error");
        setGpsError(
          err.code === 1 ? "Location access denied. Please allow location in your browser."
            : err.code === 2 ? "Location unavailable. Check your device GPS."
            : "Location request timed out. Please try again."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [state.prediction, clearRoute]);

  // ===========================================================================
  // RENDER
  // ===========================================================================
  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="map-container" />

      {state.visibleLayers.filter((id) => id in SPATIAL_LAYERS).length > 0
        ? <SpatialLayerLegend />
        : <HazardLegend />
      }

      {/* GPS Emergency Button */}
      <GpsButton status={gpsStatus} error={gpsError} onLocate={handleGpsLocate} />

      {/* Nearest facilities panel */}
      {showNearestPanel && userLocation && (
        <NearestFacilitiesPanel
          results={nearestResults}
          activeRouteType={activeRoute?.type ?? null}
          routeLoading={routeLoading}
          onClose={() => { setShowNearestPanel(false); clearRoute(); }}
          onFlyTo={(coords) => mapRef.current?.flyTo({ center: coords, zoom: 17, duration: 800 })}
          onSelect={(result) => {
            const map = mapRef.current;
            if (!map) return;

            // Show the facility popup
            setSelectedFacility({
              type: result.type,
              name: result.name,
              address: result.address,
              floodProb: result.floodProb,
              lngLat: result.lngLat,
            });

            // Ensure layer is loaded/visible on the map
            if (!loadedFacilitiesRef.current.has(result.type)) {
              loadFacilityLayer(
                map, result.type, loadedFacilitiesRef,
                facilityDataCacheRef, state.prediction,
                (facility) => setSelectedFacility(facility)
              );
              dispatch({ type: "TOGGLE_FACILITY", payload: result.type });
            }

            // Draw route from user GPS to facility
            if (userLocation) {
              drawRoute(userLocation, result.lngLat, result.name, result.type);
            }
          }}
        />
      )}

      {/* Route direction panel */}
      {(activeRoute || routeLoading) && (
        <RoutePanel
          routeInfo={routeInfo}
          activeRoute={activeRoute}
          loading={routeLoading}
          onClose={clearRoute}
        />
      )}

      {/* Barangay popup */}
      {state.selectedBarangay && state.prediction && (
        <BarangayPopup
          barangayId={state.selectedBarangay}
          prediction={state.prediction}
          onClose={() => dispatch({ type: "SELECT_BARANGAY", payload: null })}
        />
      )}

      {/* Facility click popup */}
      {selectedFacility && (
        <FacilityPopup
          facility={selectedFacility}
          onClose={() => setSelectedFacility(null)}
        />
      )}
    </div>
  );
}

// =============================================================================
// GPS BUTTON
// =============================================================================

function GpsButton({ status, error, onLocate }: {
  status: GpsStatus; error: string | null; onLocate: () => void;
}) {
  return (
    <div className="absolute top-4 right-16 z-[1000] flex flex-col items-end gap-2">
      <button
        onClick={onLocate}
        disabled={status === "locating"}
        title="Find nearest emergency facilities"
        className={`
          flex items-center gap-2 px-3 py-2 rounded-xl shadow-lg text-xs font-semibold
          border transition-all duration-200 select-none
          ${status === "locating" ? "bg-blue-50 border-blue-200 text-blue-400 cursor-wait"
            : status === "located" ? "bg-blue-600 border-blue-700 text-white hover:bg-blue-700"
            : status === "error" ? "bg-red-50 border-red-200 text-red-500 hover:bg-red-100"
            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}
        `}
      >
        <span className={status === "locating" ? "animate-spin" : ""}>
          {status === "locating" ? "⏳" : status === "located" ? "📍" : status === "error" ? "⚠️" : "🚨"}
        </span>
        <span>
          {status === "locating" ? "Locating..."
            : status === "located" ? "Nearest Facilities"
            : status === "error" ? "Retry Location"
            : "Find Nearest (Emergency)"}
        </span>
      </button>
      {status === "error" && error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-[10px] rounded-lg px-3 py-2 max-w-[220px] shadow">
          {error}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// NEAREST FACILITIES PANEL
// =============================================================================

function NearestFacilitiesPanel({ results, onClose, onFlyTo, onSelect, activeRouteType, routeLoading }: {
  results: NearestResult[];
  onClose: () => void;
  onFlyTo: (coords: [number, number]) => void;
  onSelect: (result: NearestResult) => void;
  activeRouteType: FacilityLayerId | null;
  routeLoading: boolean;
}) {
  const floodColor = (p: number | null) =>
    p === null ? "#9ca3af" : p >= 0.75 ? "#7c3aed" : p >= 0.5 ? "#dc2626"
      : p >= 0.25 ? "#f97316" : p >= 0.1 ? "#eab308" : "#22c55e";
  const floodLabel = (p: number | null) =>
    p === null ? "No data" : p >= 0.75 ? "Very High Risk" : p >= 0.5 ? "High Risk"
      : p >= 0.25 ? "Moderate Risk" : p >= 0.1 ? "Low Risk" : "Minimal Risk";

  return (
    <div className="absolute top-16 right-4 z-[1000] bg-white rounded-xl shadow-xl border border-surface-3 w-72 max-h-[70vh] flex flex-col animate-slide-up">
      <div className="p-3 border-b border-surface-3 flex items-center justify-between flex-shrink-0">
        <div>
          <p className="font-display font-bold text-sm text-brand-900">🚨 Nearest Facilities</p>
          <p className="text-[10px] text-gray-400">Based on your current GPS location</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
      </div>

      <div className="overflow-y-auto flex-1 p-2 space-y-1">
        {results.length === 0 ? (
          <div className="text-center text-gray-400 text-xs py-6">
            No facilities found nearby.<br />Make sure facility data is loaded.
          </div>
        ) : results.map((r, i) => {
          const config = FACILITY_LAYERS[r.type];
          const fc = floodColor(r.floodProb);
          const isActive = activeRouteType === r.type;
          const isLoading = routeLoading && isActive;

          return (
            <button
              key={`${r.type}-${i}`}
              onClick={() => { onFlyTo(r.lngLat); onSelect(r); }}
              className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                isActive
                  ? "bg-blue-50 border-blue-300 shadow-sm"
                  : "hover:bg-gray-50 border-transparent hover:border-gray-200"
              }`}
            >
              <div className="flex items-start gap-2">
                <div
                  className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white mt-0.5"
                  style={{ background: config.color }}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-xs">{config.icon}</span>
                    <p className="text-xs font-semibold text-brand-900 truncate">{r.name || "Unnamed"}</p>
                  </div>
                  <p className="text-[10px] text-gray-400 truncate">{config.label}</p>
                  {r.address && <p className="text-[10px] text-gray-400 truncate">📍 {r.address}</p>}
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] font-bold text-blue-600">📏 {formatDistance(r.distanceM)}</span>
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ color: fc, background: `${fc}18` }}
                    >
                      {floodLabel(r.floodProb)}
                    </span>
                  </div>
                  {/* Route indicator */}
                  {isLoading && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] text-blue-500 animate-pulse">🗺️ Calculating route...</span>
                    </div>
                  )}
                  {isActive && !isLoading && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] text-blue-600 font-semibold">🔵 Route active</span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-2 border-t border-surface-3 flex-shrink-0">
        <p className="text-[10px] text-gray-400 text-center">Tap a facility to fly to it &amp; get directions</p>
      </div>
    </div>
  );
}

// =============================================================================
// ROUTE PANEL
// =============================================================================

function RoutePanel({ routeInfo, activeRoute, loading, onClose }: {
  routeInfo: RouteInfo | null;
  activeRoute: ActiveRoute | null;
  loading: boolean;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = activeRoute ? FACILITY_LAYERS[activeRoute.type] : null;

  return (
    <div className="absolute bottom-8 left-4 z-[1000] bg-white rounded-xl shadow-xl border border-surface-3 w-72 animate-slide-up">
      {/* Header */}
      <div
        className="p-3 border-b border-surface-3 flex items-center justify-between"
        style={{ borderLeft: `4px solid ${config?.color ?? "#2563eb"}` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base flex-shrink-0">{config?.icon ?? "🗺️"}</span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-brand-900 truncate">
              {activeRoute?.name ?? "Getting directions..."}
            </p>
            <p className="text-[10px] text-gray-400">{config?.label ?? "Directions"}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs ml-2 flex-shrink-0">✕</button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="px-4 py-5 flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-brand-900">Calculating route...</p>
            <p className="text-[10px] text-gray-400">Using road network data</p>
          </div>
        </div>
      )}

      {/* Route summary */}
      {!loading && routeInfo && (
        <>
          <div className="px-3 py-2.5 flex items-center gap-3 bg-blue-50">
            {/* Distance */}
            <div className="flex items-center gap-1.5">
              <span className="text-base">🚗</span>
              <div>
                <p className="text-xs font-bold text-blue-700">{formatDistance(routeInfo.distanceM)}</p>
                <p className="text-[10px] text-blue-500">by road</p>
              </div>
            </div>
            <div className="w-px h-8 bg-blue-200" />
            {/* Duration */}
            <div className="flex items-center gap-1.5">
              <span className="text-base">⏱️</span>
              <div>
                <p className="text-xs font-bold text-blue-700">{formatDuration(routeInfo.durationS)}</p>
                <p className="text-[10px] text-blue-500">est. drive time</p>
              </div>
            </div>
            {/* Toggle steps */}
            <button
              onClick={() => setExpanded((e) => !e)}
              className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-800 flex-shrink-0 bg-white border border-blue-200 rounded-md px-2 py-1 transition-colors"
            >
              {expanded ? "▲ Hide" : "▼ Steps"}
            </button>
          </div>

          {/* Turn-by-turn steps */}
          {expanded && (
            <div className="max-h-52 overflow-y-auto divide-y divide-gray-50">
              {routeInfo.steps
                .filter((s) => s.instruction.trim())
                .map((step, i) => (
                  <div key={i} className="flex items-start gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors">
                    <span className="text-sm flex-shrink-0 w-5 text-center leading-5">
                      {stepIcon(step.instruction)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-brand-900 leading-snug capitalize">
                        {step.instruction}
                      </p>
                      {step.distanceM > 5 && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {formatDistance(step.distanceM)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}

          <div className="px-3 py-2 border-t border-surface-3">
            <p className="text-[10px] text-gray-400 text-center">
              🗺️ Driving route via OSRM · Road network data
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// FIND NEAREST FACILITIES
// =============================================================================

async function findNearestFacilities(
  userCoords: [number, number],
  cacheRef: React.MutableRefObject<Map<FacilityLayerId, any[]>>,
  prediction: any,
  setResults: (r: NearestResult[]) => void
) {
  const probMap = new Map<string, number>();
  if (prediction?.barangays && prediction?.flood_probability) {
    (prediction.barangays as string[]).forEach((name: string, i: number) =>
      probMap.set(name.toLowerCase(), prediction.flood_probability[i]));
  } else if (prediction?.barangayHazards) {
    prediction.barangayHazards.forEach((h: any) =>
      probMap.set(h.barangayName.toLowerCase(), h.floodProbability));
  }

  const results: NearestResult[] = [];

  await Promise.all(
    (Object.keys(FACILITY_LAYERS) as FacilityLayerId[]).map(async (type) => {
      let features = cacheRef.current.get(type);
      if (!features) {
        try {
          const res = await fetch(FACILITY_LAYERS[type].filePath);
          if (!res.ok) return;
          const geojson = await res.json();
          features = (geojson.features ?? []).filter(
            (f: any) => f.geometry?.type === "Point"
          ) as any[];
          cacheRef.current.set(type, features as any[]);
        } catch { return; }
      }
      if (!features?.length) return;

      let nearest: any = null, nearestDist = Infinity;
      features.forEach((f: any) => {
        const d = haversineMeters(userCoords, f.geometry.coordinates as [number, number]);
        if (d < nearestDist) { nearestDist = d; nearest = f; }
      });
      if (!nearest) return;

      const props = nearest.properties ?? {};
      const brgy = (
        props.barangay ?? props["addr:barangay"] ?? props["addr:village"] ?? ""
      ).toLowerCase();
      results.push({
        type,
        name: props.name ?? props.NAME ?? props.facility_name ?? "",
        address: props.address ?? props["addr:street"] ?? props["addr:full"] ?? props.location ?? props.barangay ?? "",
        distanceM: nearestDist,
        lngLat: nearest.geometry.coordinates as [number, number],
        floodProb: probMap.get(brgy) ?? null,
      });
    })
  );

  results.sort((a, b) => a.distanceM - b.distanceM);
  setResults(results);
}

// =============================================================================
// FACILITY LAYER LOADER
// =============================================================================

async function loadFacilityLayer(
  map: maplibregl.Map,
  facilityType: FacilityLayerId,
  loadedFacilitiesRef: React.MutableRefObject<Set<FacilityLayerId>>,
  cacheRef: React.MutableRefObject<Map<FacilityLayerId, any[]>>,
  prediction: any,
  onSelect: (facility: SelectedFacility) => void
) {
  const config = FACILITY_LAYERS[facilityType];
  try {
    let features = cacheRef.current.get(facilityType);
    let geojson: any;

    if (!features) {
      const response = await fetch(config.filePath);
      if (!response.ok) { console.warn(`[MapContent] Not found: ${config.filePath}`); return; }
      geojson = await response.json();
      features = (geojson.features ?? []).filter((f: any) => f.geometry?.type === "Point") as any[];
      cacheRef.current.set(facilityType, features as any[]);
    } else {
      geojson = { type: "FeatureCollection", features };
    }
    if (!features?.length) return;

    const probMap = new Map<string, number>();
    if (prediction?.barangays && prediction?.flood_probability) {
      (prediction.barangays as string[]).forEach((name: string, i: number) =>
        probMap.set(name.toLowerCase(), prediction.flood_probability[i]));
    } else if (prediction?.barangayHazards) {
      prediction.barangayHazards.forEach((h: any) =>
        probMap.set(h.barangayName.toLowerCase(), h.floodProbability));
    }

    const enriched = {
      ...geojson,
      features: features.map((f: any) => {
        const brgy = (
          f.properties?.barangay ?? f.properties?.["addr:barangay"] ??
          f.properties?.["addr:village"] ?? f.properties?.bgy_name ?? ""
        ).toLowerCase();
        return { ...f, properties: { ...f.properties, flood_prob: probMap.get(brgy) ?? null } };
      }),
    };

    const sourceId = `facility-source-${facilityType}`;
    const circleId = `facility-circle-${facilityType}`;
    const labelId = `facility-label-${facilityType}`;

    if (map.getLayer(labelId)) map.removeLayer(labelId);
    if (map.getLayer(circleId)) map.removeLayer(circleId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    map.addSource(sourceId, { type: "geojson", data: enriched });

    map.addLayer({
      id: circleId, type: "circle", source: sourceId,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 14, 8, 17, 12],
        "circle-color": config.color,
        "circle-opacity": 0.92,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });

    map.addLayer({
      id: labelId, type: "symbol", source: sourceId, minzoom: 14,
      layout: {
        "text-field": ["coalesce", ["get", "name"], ["get", "NAME"], ["literal", config.label]],
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        "text-size": 10, "text-anchor": "top", "text-offset": [0, 1],
        "text-allow-overlap": false, "text-optional": true,
      },
      paint: { "text-color": "#1e293b", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
    });

    map.on("click", circleId, (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const props = feature.properties ?? {};
      const coords = (feature.geometry as any).coordinates as [number, number];
      onSelect({
        type: facilityType,
        name: props.name ?? props.NAME ?? props.facility_name ?? "",
        address: props.address ?? props["addr:street"] ?? props["addr:full"] ?? props.location ?? props.barangay ?? "",
        floodProb: props.flood_prob !== null && props.flood_prob !== undefined ? Number(props.flood_prob) : null,
        lngLat: coords,
      });
      map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 15), duration: 800 });
    });

    map.on("mouseenter", circleId, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", circleId, () => { map.getCanvas().style.cursor = ""; });

    loadedFacilitiesRef.current.add(facilityType);
    console.log(`[MapContent] Facility layer "${facilityType}" loaded. Features: ${features.length}`);
  } catch (e) {
    console.warn(`[MapContent] Could not load facility layer "${facilityType}":`, e);
  }
}

// =============================================================================
// BARANGAY BOUNDARIES
// =============================================================================

async function loadBarangayBoundaries(map: maplibregl.Map): Promise<void> {
  try {
    const response = await fetch("/spatial/guicadale_map.geojson");
    if (!response.ok) { console.warn("[MapContent] guicadale_map.geojson not found"); return; }
    const geojson = await response.json();
    if (!geojson.features?.length) return;

    map.addSource("barangays", { type: "geojson", data: geojson });
    map.addLayer({
      id: "barangay-fill", type: "fill", source: "barangays",
      paint: { "fill-color": "#0d4f7a", "fill-opacity": 0.08 },
    });
    map.addLayer({
      id: "barangay-outline", type: "line", source: "barangays",
      paint: { "line-color": "#0d4f7a", "line-width": 1.5, "line-opacity": 0.7, "line-dasharray": [4, 2] },
    });
    map.addLayer({
      id: "barangay-labels", type: "symbol", source: "barangays", minzoom: 13,
      layout: {
        "text-field": ["coalesce", ["get", "bgy_name"], ["get", "name"], ["get", "BGY_NAME"], ["get", "NAME"]],
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        "text-size": 11, "text-anchor": "center", "text-allow-overlap": false,
      },
      paint: { "text-color": "#0d4f7a", "text-halo-color": "#ffffff", "text-halo-width": 2 },
    });
    console.log("[MapContent] Barangay boundaries added. Features:", geojson.features.length);
  } catch (e) {
    console.error("[MapContent] Could not load barangay boundaries:", e);
  }
}

// =============================================================================
// SPATIAL LAYER LOADER
// =============================================================================

async function loadSpatialLayer(
  map: maplibregl.Map,
  layerId: string,
  loadedLayersRef: React.MutableRefObject<Set<string>>
) {
  const layerConfig = SPATIAL_LAYERS[layerId as keyof typeof SPATIAL_LAYERS];
  if (!layerConfig) return;
  try {
    const parseGeoraster = (await import("georaster")).default;
    const response = await fetch(layerConfig.filePath);
    if (!response.ok) { console.warn(`[MapContent] Not found: ${layerConfig.filePath}`); return; }

    const arrayBuffer = await response.arrayBuffer();
    const georaster = await parseGeoraster(arrayBuffer);

    if (
      Math.abs(georaster.xmin) > 180 || Math.abs(georaster.xmax) > 180 ||
      Math.abs(georaster.ymin) > 90 || Math.abs(georaster.ymax) > 90
    ) {
      console.error(`[MapContent] Layer "${layerId}" not EPSG:4326 — re-export from QGIS.`);
      return;
    }

    const width = georaster.width, height = georaster.height;
    const values = georaster.values[0];
    const [min, max] = layerConfig.valueRange;
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.createImageData(width, height);

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const val = values[row][col];
        const idx = (row * width + col) * 4;
        if (val === georaster.noDataValue || val === undefined || val === null || isNaN(val)) {
          imageData.data[idx + 3] = 0; continue;
        }
        let color: string | null = null;
        if (layerConfig.categorical) {
          const classCode = Math.round(val);
          if (layerId === "lulc") color = LULC_CLASSES[classCode]?.color ?? null;
          if (layerId === "geology") color = GEOLOGY_CLASSES[classCode]?.color ?? null;
        } else {
          let normalized: number;
          if (layerConfig.colorScale === "logarithmic") {
            const logMin = Math.log10(Math.max(1, min)), logMax = Math.log10(Math.max(1, max));
            normalized = (Math.log10(Math.max(1, val)) - logMin) / (logMax - logMin);
          } else {
            normalized = (val - min) / (max - min);
          }
          normalized = Math.max(0, Math.min(1, normalized));
          color = interpolateColorRamp(normalized, layerConfig.colorRamp);
        }
        if (!color) { imageData.data[idx + 3] = 0; continue; }
        const [r, g, b] = parseColor(color);
        imageData.data[idx] = r; imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b; imageData.data[idx + 3] = Math.round(layerConfig.opacity * 255);
      }
    }
    ctx.putImageData(imageData, 0, 0);

    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
    const blobUrl = URL.createObjectURL(blob);
    const sourceId = `raster-source-${layerId}`, layerGlId = `raster-layer-${layerId}`;
    if (map.getLayer(layerGlId)) map.removeLayer(layerGlId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
    map.addSource(sourceId, {
      type: "image", url: blobUrl,
      coordinates: [
        [georaster.xmin, georaster.ymax], [georaster.xmax, georaster.ymax],
        [georaster.xmax, georaster.ymin], [georaster.xmin, georaster.ymin],
      ],
    });
    const layerDef: any = {
      id: layerGlId, type: "raster", source: sourceId,
      paint: { "raster-opacity": layerConfig.opacity, "raster-fade-duration": 300, "raster-resampling": "nearest" },
    };
    if (map.getLayer("barangay-fill")) map.addLayer(layerDef, "barangay-fill");
    else map.addLayer(layerDef);
    loadedLayersRef.current.add(layerId);
  } catch (e) {
    console.warn(`[MapContent] Could not load spatial layer "${layerId}":`, e);
  }
}

// =============================================================================
// HAZARD OVERLAY
// =============================================================================

async function renderHazardOverlay(map: maplibregl.Map, prediction: any) {
  try {
    const response = await fetch("/spatial/guicadale_map.geojson");
    if (!response.ok) return;
    const geojson = await response.json();
    const probMap = new Map<string, number>();
    if (prediction.barangays && prediction.flood_probability) {
      (prediction.barangays as string[]).forEach((name: string, i: number) =>
        probMap.set(name.toLowerCase(), prediction.flood_probability[i]));
    } else if (prediction.barangayHazards) {
      prediction.barangayHazards.forEach((h: any) =>
        probMap.set(h.barangayName.toLowerCase(), h.floodProbability));
    }
    const colored = {
      ...geojson,
      features: geojson.features.map((f: any) => {
        const name = (
          f.properties?.bgy_name ?? f.properties?.name ??
          f.properties?.BGY_NAME ?? f.properties?.NAME ?? ""
        ).toLowerCase();
        return { ...f, properties: { ...f.properties, flood_prob: probMap.get(name) ?? null } };
      }),
    };
    map.addSource("hazard-source", { type: "geojson", data: colored });
    map.addLayer({
      id: "hazard-fill", type: "fill", source: "hazard-source",
      paint: {
        "fill-color": ["case",
          ["==", ["get", "flood_prob"], null], "#cccccc",
          [">=", ["get", "flood_prob"], 0.75], "#7c3aed",
          [">=", ["get", "flood_prob"], 0.50], "#dc2626",
          [">=", ["get", "flood_prob"], 0.25], "#f97316",
          [">=", ["get", "flood_prob"], 0.10], "#eab308",
          "#22c55e"],
        "fill-opacity": 0.5,
      },
    });
    map.addLayer({
      id: "hazard-outline", type: "line", source: "hazard-source",
      paint: {
        "line-color": ["case",
          ["==", ["get", "flood_prob"], null], "#999999",
          [">=", ["get", "flood_prob"], 0.75], "#7c3aed",
          [">=", ["get", "flood_prob"], 0.50], "#dc2626",
          [">=", ["get", "flood_prob"], 0.25], "#f97316",
          [">=", ["get", "flood_prob"], 0.10], "#eab308",
          "#22c55e"],
        "line-width": 1.5, "line-opacity": 0.8,
      },
    });
  } catch (e) {
    console.warn("[MapContent] Could not render hazard overlay:", e);
  }
}

// =============================================================================
// COLOR HELPERS
// =============================================================================

function interpolateColorRamp(t: number, ramp: string[]): string {
  const idx = t * (ramp.length - 1), lo = Math.floor(idx);
  const hi = Math.min(lo + 1, ramp.length - 1), frac = idx - lo;
  const parse = (hex: string) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  });
  const c1 = parse(ramp[lo]), c2 = parse(ramp[hi]);
  return `rgb(${Math.round(c1.r + (c2.r - c1.r) * frac)},${Math.round(c1.g + (c2.g - c1.g) * frac)},${Math.round(c1.b + (c2.b - c1.b) * frac)})`;
}

function parseColor(color: string): [number, number, number] {
  if (color.startsWith("rgb")) {
    const [r, g, b] = color.match(/\d+/g)!.map(Number); return [r, g, b];
  }
  const hex = color.replace("#", "");
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

// =============================================================================
// FACILITY CLICK POPUP
// =============================================================================

function FacilityPopup({ facility, onClose }: { facility: SelectedFacility; onClose: () => void }) {
  const config = FACILITY_LAYERS[facility.type];
  const floodColor =
    facility.floodProb === null ? "#9ca3af"
      : facility.floodProb >= 0.75 ? "#7c3aed"
      : facility.floodProb >= 0.5 ? "#dc2626"
      : facility.floodProb >= 0.25 ? "#f97316"
      : facility.floodProb >= 0.1 ? "#eab308"
      : "#22c55e";
  const floodLabel =
    facility.floodProb === null ? "No data"
      : facility.floodProb >= 0.75 ? "Very High"
      : facility.floodProb >= 0.5 ? "High"
      : facility.floodProb >= 0.25 ? "Moderate"
      : facility.floodProb >= 0.1 ? "Low"
      : "Minimal";

  return (
    <div className="absolute top-4 left-4 z-[1000] bg-white rounded-xl shadow-xl border border-surface-3 w-64 animate-slide-up">
      <div
        className="p-3 border-b border-surface-3 flex items-center justify-between"
        style={{ borderLeft: `4px solid ${config.color}` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base flex-shrink-0">{config.icon}</span>
          <div className="min-w-0">
            <p className="font-display font-bold text-xs text-brand-900 truncate">
              {facility.name || "Unnamed Facility"}
            </p>
            <p className="text-[10px] text-gray-400">{config.label}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs flex-shrink-0 ml-2">✕</button>
      </div>
      <div className="p-3 space-y-2 text-xs">
        {facility.address && (
          <div className="flex gap-2">
            <span className="text-gray-400 flex-shrink-0">📍</span>
            <span className="text-gray-600">{facility.address}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-1 border-t border-gray-100">
          <span className="text-gray-500">Flood Risk</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: floodColor }} />
            <span className="font-semibold" style={{ color: floodColor }}>
              {floodLabel}{facility.floodProb !== null && ` (${Math.round(facility.floodProb * 100)}%)`}
            </span>
          </div>
        </div>
        <div className="text-[10px] text-gray-400 pt-1">
          {facility.lngLat[1].toFixed(5)}°N, {facility.lngLat[0].toFixed(5)}°E
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// BARANGAY POPUP
// =============================================================================

function BarangayPopup({ barangayId, prediction, onClose }: {
  barangayId: string; prediction: any; onClose: () => void;
}) {
  const brgy = prediction.barangayHazards?.find((h: any) => h.barangayId === barangayId);
  if (!brgy) return null;
  const hazardColor = getHazardColor(brgy.hazardLevel);
  return (
    <div className="absolute top-4 right-4 z-[1000] bg-white rounded-xl shadow-xl border border-surface-3 w-72 animate-slide-up">
      <div className="p-3 border-b border-surface-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: hazardColor }} />
          <span className="font-display font-bold text-sm text-brand-900">{brgy.barangayName}</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
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