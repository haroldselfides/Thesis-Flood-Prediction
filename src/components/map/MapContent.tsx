"use client";

import { useEffect, useRef } from "react";
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

export default function MapContent() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedLayersRef = useRef<Set<string>>(new Set());
  // FIX: track whether the map "load" event has fired AND barangays are ready
  const mapReadyRef = useRef(false);
  const barangaysReadyRef = useRef(false);

  const state = useAppState();
  const dispatch = useAppDispatch();

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

    // Navigation control (zoom + rotate + pitch)
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");

    // Scale bar
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", () => {
      // FIX: patch ALL existing fill-extrusion layers from the base style that
      // use render_height/render_min_height without null guards. These come from
      // the OpenFreeMap liberty style itself and cause "Expected number, found null"
      // errors in the tile worker. We can't fix the style JSON, so we patch after load.
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

            if (paint["fill-extrusion-height"]) {
              map.setPaintProperty(
                layer.id,
                "fill-extrusion-height",
                wrapCoalesce(paint["fill-extrusion-height"])
              );
            }
            if (paint["fill-extrusion-base"]) {
              map.setPaintProperty(
                layer.id,
                "fill-extrusion-base",
                wrapCoalesce(paint["fill-extrusion-base"])
              );
            }
            if (paint["fill-extrusion-color"]) {
              map.setPaintProperty(
                layer.id,
                "fill-extrusion-color",
                wrapCoalesce(paint["fill-extrusion-color"])
              );
            }
          }
        });
      }

      // Fit to Legazpi bounds
      map.fitBounds(
        [
          [LEGAZPI_BOUNDS[0][1], LEGAZPI_BOUNDS[0][0]],
          [LEGAZPI_BOUNDS[1][1], LEGAZPI_BOUNDS[1][0]],
        ],
        { padding: 40, pitch: 45, duration: 1200 }
      );

      // 3D building extrusion
      // FIX: wrap all render_height/render_min_height with coalesce to handle
      // null values on buildings that have no height data in the vector tiles.
      map.addLayer({
        id: "3d-buildings",
        source: "openmaptiles",
        "source-layer": "building",
        type: "fill-extrusion",
        minzoom: 14,
        paint: {
          "fill-extrusion-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "render_height"], 0],
            0,   "#e8dcc8",
            50,  "#d4c5a9",
            100, "#b8a88a",
            200, "#9c8b6e",
          ],
          "fill-extrusion-height": [
            "interpolate",
            ["linear"],
            ["zoom"],
            14, 0,
            16, ["coalesce", ["get", "render_height"], 0],
          ],
          "fill-extrusion-base": [
            "interpolate",
            ["linear"],
            ["zoom"],
            14, 0,
            16, ["coalesce", ["get", "render_min_height"], 0],
          ],
          "fill-extrusion-opacity": 0.85,
        },
      });

      // FIX: mark map ready BEFORE loading barangays, then mark barangays ready
      // inside the async callback so spatial layers can safely query both.
      mapReadyRef.current = true;

      // Load barangay boundaries, then notify that spatial layers can render
      loadBarangayBoundaries(map).then(() => {
        barangaysReadyRef.current = true;
        // Dispatch a custom event so the visibleLayers effect can re-run
        map.fire("barangays-ready");
      });
    });

    // Zoom-based barangay style update
    map.on("zoom", () => {
      const z = map.getZoom();
      if (map.getLayer("barangay-fill")) {
        map.setPaintProperty("barangay-fill", "fill-opacity",
          z >= STREET_ZOOM_THRESHOLD ? 0 : 0.08
        );
      }
      if (map.getLayer("barangay-outline")) {
        map.setPaintProperty("barangay-outline", "line-opacity",
          z >= STREET_ZOOM_THRESHOLD ? 0.9 : 0.6
        );
      }
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
  // HANDLE SPATIAL LAYER VISIBILITY
  // ===========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyLayers = () => {
      // FIX: guard — only proceed once the map style AND barangays are ready
      if (!mapReadyRef.current) return;

      // Remove layers toggled off
      loadedLayersRef.current.forEach((layerId) => {
        if (!state.visibleLayers.includes(layerId as any)) {
          const sourceId  = `raster-source-${layerId}`;
          const layerGlId = `raster-layer-${layerId}`;
          if (map.getLayer(layerGlId))  map.removeLayer(layerGlId);
          if (map.getSource(sourceId))  map.removeSource(sourceId);
          loadedLayersRef.current.delete(layerId);
        }
      });

      // Add layers toggled on
      state.visibleLayers.forEach((layerId) => {
        if (
          layerId in SPATIAL_LAYERS &&
          !loadedLayersRef.current.has(layerId)
        ) {
          loadSpatialLayer(map, layerId, loadedLayersRef);
        }
      });
    };

    if (map.isStyleLoaded() && mapReadyRef.current) {
      applyLayers();
    } else {
      // FIX: listen for both "load" and our custom "barangays-ready" event
      map.once("load", applyLayers);
      map.once("barangays-ready" as any, applyLayers);
    }
  }, [state.visibleLayers]);

  // ===========================================================================
  // HANDLE PREDICTION HAZARD OVERLAY
  // ===========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyHazard = () => {
      if (map.getLayer("hazard-fill"))    map.removeLayer("hazard-fill");
      if (map.getLayer("hazard-outline")) map.removeLayer("hazard-outline");
      if (map.getSource("hazard-source")) map.removeSource("hazard-source");

      if (state.prediction) {
        renderHazardOverlay(map, state.prediction);
      }
    };

    if (map.isStyleLoaded()) {
      applyHazard();
    } else {
      map.once("load", applyHazard);
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
// BARANGAY BOUNDARIES
// FIX: now returns a Promise so the caller knows when it's done
// =============================================================================

async function loadBarangayBoundaries(map: maplibregl.Map): Promise<void> {
  try {
    console.log("[MapContent] Fetching guicadale_map.geojson...");
    const response = await fetch("/spatial/guicadale_map.geojson");
    if (!response.ok) {
      console.warn("[MapContent] guicadale_map.geojson not found — check /public/spatial/");
      return;
    }

    const geojson = await response.json();
    if (!geojson.features?.length) {
      console.warn("[MapContent] GeoJSON has no features.");
      return;
    }

    map.addSource("barangays", {
      type: "geojson",
      data: geojson,
    });

    // Translucent fill (fades at street zoom)
    map.addLayer({
      id: "barangay-fill",
      type: "fill",
      source: "barangays",
      paint: {
        "fill-color": "#0d4f7a",
        "fill-opacity": 0.08,
      },
    });

    // Dashed outline
    map.addLayer({
      id: "barangay-outline",
      type: "line",
      source: "barangays",
      paint: {
        "line-color": "#0d4f7a",
        "line-width": 1.5,
        "line-opacity": 0.7,
        "line-dasharray": [4, 2],
      },
    });

    // Barangay name labels
    map.addLayer({
      id: "barangay-labels",
      type: "symbol",
      source: "barangays",
      minzoom: 13,
      layout: {
        "text-field": [
          "coalesce",
          ["get", "bgy_name"],
          ["get", "name"],
          ["get", "BGY_NAME"],
          ["get", "NAME"],
        ],
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        "text-size": 11,
        "text-anchor": "center",
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#0d4f7a",
        "text-halo-color": "#ffffff",
        "text-halo-width": 2,
      },
    });

    console.log("[MapContent] Barangay boundaries added. Features:", geojson.features.length);
  } catch (e) {
    console.error("[MapContent] Could not load barangay boundaries:", e);
  }
}

// =============================================================================
// SPATIAL LAYER LOADER — GeoTIFF → offscreen canvas → MapLibre image source
// =============================================================================

async function loadSpatialLayer(
  map: maplibregl.Map,
  layerId: string,
  loadedLayersRef: React.MutableRefObject<Set<string>>
) {
  const layerConfig = SPATIAL_LAYERS[layerId as keyof typeof SPATIAL_LAYERS];
  if (!layerConfig) return;

  try {
    console.log(`[MapContent] Loading spatial layer: ${layerId}`);
    const parseGeoraster = (await import("georaster")).default;

    const response = await fetch(layerConfig.filePath);
    if (!response.ok) {
      console.warn(`[MapContent] File not found: ${layerConfig.filePath}`);
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const georaster = await parseGeoraster(arrayBuffer);

    // FIX: validate that the GeoTIFF bounds look like geographic coordinates
    // (EPSG:4326). If xmin/xmax are in the millions it's a projected CRS.
    if (
      Math.abs(georaster.xmin) > 180 ||
      Math.abs(georaster.xmax) > 180 ||
      Math.abs(georaster.ymin) > 90  ||
      Math.abs(georaster.ymax) > 90
    ) {
      console.error(
        `[MapContent] Layer "${layerId}" bounds look like a projected CRS (not EPSG:4326). ` +
        `xmin=${georaster.xmin}, xmax=${georaster.xmax}, ymin=${georaster.ymin}, ymax=${georaster.ymax}. ` +
        `Re-export from QGIS using CRS: EPSG:4326.`
      );
      return;
    }

    const width  = georaster.width;
    const height = georaster.height;
    const values = georaster.values[0]; // first band
    const [min, max] = layerConfig.valueRange;

    // Render pixels onto an offscreen canvas
    const canvas = document.createElement("canvas");
    canvas.width  = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.createImageData(width, height);

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const val = values[row][col];
        const idx = (row * width + col) * 4;

        // Transparent for nodata / null / NaN
        if (
          val === georaster.noDataValue ||
          val === undefined ||
          val === null  ||
          isNaN(val)
        ) {
          imageData.data[idx + 3] = 0;
          continue;
        }

        let color: string | null = null;

        if (layerConfig.categorical) {
          const classCode = Math.round(val);
          if (layerId === "lulc")    color = LULC_CLASSES[classCode]?.color    ?? null;
          if (layerId === "geology") color = GEOLOGY_CLASSES[classCode]?.color ?? null;
        } else {
          let normalized: number;
          if (layerConfig.colorScale === "logarithmic") {
            const logMin = Math.log10(Math.max(1, min));
            const logMax = Math.log10(Math.max(1, max));
            const logVal = Math.log10(Math.max(1, val));
            normalized = (logVal - logMin) / (logMax - logMin);
          } else {
            normalized = (val - min) / (max - min);
          }
          normalized = Math.max(0, Math.min(1, normalized));
          color = interpolateColorRamp(normalized, layerConfig.colorRamp);
        }

        if (!color) {
          imageData.data[idx + 3] = 0;
          continue;
        }

        const [r, g, b] = parseColor(color);
        imageData.data[idx + 0] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = Math.round(layerConfig.opacity * 255);
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Convert canvas to blob URL
    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/png")
    );
    const blobUrl = URL.createObjectURL(blob);

    // GeoTIFF geographic bounds → MapLibre corner coordinates [lng, lat]
    const sourceId  = `raster-source-${layerId}`;
    const layerGlId = `raster-layer-${layerId}`;

    // Clean up if already exists
    if (map.getLayer(layerGlId))  map.removeLayer(layerGlId);
    if (map.getSource(sourceId))  map.removeSource(sourceId);

    map.addSource(sourceId, {
      type: "image",
      url: blobUrl,
      coordinates: [
        [georaster.xmin, georaster.ymax], // top-left
        [georaster.xmax, georaster.ymax], // top-right
        [georaster.xmax, georaster.ymin], // bottom-right
        [georaster.xmin, georaster.ymin], // bottom-left
      ],
    });

    // FIX: never pass `undefined` as beforeLayer — conditionally call addLayer
    // with or without the beforeLayer argument.
    if (map.getLayer("barangay-fill")) {
      map.addLayer(
        {
          id: layerGlId,
          type: "raster",
          source: sourceId,
          paint: {
            "raster-opacity": layerConfig.opacity,
            "raster-fade-duration": 300,
            "raster-resampling": "nearest",
          },
        },
        "barangay-fill" // insert below barangay so boundaries stay on top
      );
    } else {
      map.addLayer({
        id: layerGlId,
        type: "raster",
        source: sourceId,
        paint: {
          "raster-opacity": layerConfig.opacity,
          "raster-fade-duration": 300,
          "raster-resampling": "nearest",
        },
      });
    }

    loadedLayersRef.current.add(layerId);
    console.log(`[MapContent] Spatial layer "${layerId}" rendered. Size: ${width}x${height}`);

  } catch (e) {
    console.warn(`[MapContent] Could not load spatial layer "${layerId}":`, e);
    console.info(`[MapContent] Ensure ${layerConfig.filePath} exists as GeoTIFF EPSG:4326`);
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

    // Build probability lookup map
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

    // Attach flood_prob to each GeoJSON feature
    const colored = {
      ...geojson,
      features: geojson.features.map((f: any) => {
        const name = (
          f.properties?.bgy_name ??
          f.properties?.name     ??
          f.properties?.BGY_NAME ??
          f.properties?.NAME     ??
          ""
        ).toLowerCase();
        return {
          ...f,
          properties: {
            ...f.properties,
            flood_prob: probMap.get(name) ?? null,
          },
        };
      }),
    };

    map.addSource("hazard-source", { type: "geojson", data: colored });

    // Colored fill per hazard level
    map.addLayer({
      id: "hazard-fill",
      type: "fill",
      source: "hazard-source",
      paint: {
        "fill-color": [
          "case",
          ["==", ["get", "flood_prob"], null],         "#cccccc",
          [">=", ["get", "flood_prob"], 0.75],         "#7c3aed",
          [">=", ["get", "flood_prob"], 0.50],         "#dc2626",
          [">=", ["get", "flood_prob"], 0.25],         "#f97316",
          [">=", ["get", "flood_prob"], 0.10],         "#eab308",
          "#22c55e",
        ],
        "fill-opacity": 0.5,
      },
    });

    // Hazard outline
    map.addLayer({
      id: "hazard-outline",
      type: "line",
      source: "hazard-source",
      paint: {
        "line-color": [
          "case",
          ["==", ["get", "flood_prob"], null],         "#999999",
          [">=", ["get", "flood_prob"], 0.75],         "#7c3aed",
          [">=", ["get", "flood_prob"], 0.50],         "#dc2626",
          [">=", ["get", "flood_prob"], 0.25],         "#f97316",
          [">=", ["get", "flood_prob"], 0.10],         "#eab308",
          "#22c55e",
        ],
        "line-width": 1.5,
        "line-opacity": 0.8,
      },
    });

    console.log("[MapContent] Hazard overlay rendered.");
  } catch (e) {
    console.warn("[MapContent] Could not render hazard overlay:", e);
  }
}

// =============================================================================
// COLOR HELPERS
// =============================================================================

function interpolateColorRamp(t: number, ramp: string[]): string {
  const idx  = t * (ramp.length - 1);
  const lo   = Math.floor(idx);
  const hi   = Math.min(lo + 1, ramp.length - 1);
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

function parseColor(color: string): [number, number, number] {
  if (color.startsWith("rgb")) {
    const [r, g, b] = color.match(/\d+/g)!.map(Number);
    return [r, g, b];
  }
  const hex = color.replace("#", "");
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
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
          <div
            className="w-3 h-3 rounded-full"
            style={{ background: hazardColor }}
          />
          <span className="font-display font-bold text-sm text-brand-900">
            {brgy.barangayName}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xs"
        >
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
          <span className="font-semibold text-brand-900">
            {brgy.predictedRainfall} mm
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Predicted Water Level</span>
          <span className="font-semibold text-brand-900">
            {brgy.predictedWaterLevel
              ? `${brgy.predictedWaterLevel.toFixed(2)} m`
              : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}