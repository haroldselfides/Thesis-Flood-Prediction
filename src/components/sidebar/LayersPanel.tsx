"use client";

import { useAppState, useAppDispatch } from "@/hooks/useAppState";
import { SPATIAL_LAYERS, LULC_CLASSES,GEOLOGY_CLASSES, DISTANCE_FROM_RIVER_CLASSES } from "@/lib/constants";
import { LAYER_DISPLAY_ORDER } from "@/lib/utils";
import { Eye, EyeOff, Info } from "lucide-react";
import { useState } from "react";
import type { SpatialLayerId } from "@/types";

export default function LayersPanel() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [expandedLayer, setExpandedLayer] = useState<SpatialLayerId | null>(
    null
  );

  return (
    <div className="p-4">
      <h3 className="font-display font-semibold text-sm text-brand-900 mb-1">
        Spatial Layers
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Toggle the 7 flood conditioning factors from QGIS. Layers are displayed
        as GeoTIFF overlays on the map.
      </p>

      <div className="space-y-1.5">
        {LAYER_DISPLAY_ORDER.map((layerId) => {
          const layer = SPATIAL_LAYERS[layerId];
          const isVisible = state.visibleLayers.includes(layerId);
          const isExpanded = expandedLayer === layerId;

          return (
            <div
              key={layerId}
              className={`rounded-lg border transition-all ${
                isVisible
                  ? "border-brand-200 bg-brand-50/40"
                  : "border-surface-3 bg-white"
              }`}
            >
              {/* Layer row */}
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                {/* Color swatch */}
                <div
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{
                  background: (layer as any).categorical
                    ? layerId === "geology"
                      ? "linear-gradient(135deg, #1a1a1a, #7b2d8b, #e8436a, #f9f4a3)"
                      : "linear-gradient(135deg, #1a7a1a, #91cf60, #eefa8c, #b0b0b0, #9b6fd4)"
                    : layer.colorRamp.length > 0
                      ? `linear-gradient(135deg, ${layer.colorRamp[0]}, ${layer.colorRamp[layer.colorRamp.length - 1]})`
                      : "#cccccc",
                }}
                />

                {/* Label */}
                <span className="flex-1 text-xs font-medium text-brand-900 leading-tight">                  {layer.label}
                </span>

                {/* Info toggle */}
                <button
                  onClick={() =>
                    setExpandedLayer(isExpanded ? null : layerId)
                  }
                  className="p-1 rounded hover:bg-brand-100 text-gray-400 hover:text-brand-600 transition-colors"
                >
                  <Info size={13} />
                </button>

                {/* Visibility toggle */}
                <button
                  onClick={() =>
                    dispatch({ type: "TOGGLE_LAYER", payload: layerId })
                  }
                  className={`p-1 rounded transition-colors ${
                    isVisible
                      ? "text-brand-600 hover:bg-brand-100"
                      : "text-gray-300 hover:text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {isVisible ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
              </div>

              {/* Expanded info */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-0">
                  <div className="text-[11px] text-gray-600 leading-relaxed bg-white rounded-md p-2.5 border border-surface-3">
                    <p>{layer.description}</p>
                    <div className="mt-2 flex gap-4 text-[10px] text-gray-400">
                      <span>
                        Unit: <strong className="text-gray-600">{layer.unit}</strong>
                      </span>
                      <span>
                        Source: <strong className="text-gray-600">{layer.source}</strong>
                      </span>
                    </div>
                  
                  {/* Color ramp preview */}
                  <div className="mt-2">
                    {(layer as any).categorical ? (
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(
                          layerId === "geology"
                            ? GEOLOGY_CLASSES
                            : layerId === "distance_from_river"
                            ? DISTANCE_FROM_RIVER_CLASSES
                            : LULC_CLASSES
                        ).map(([code, { label, color }]) => (
                          <div key={code} className="flex items-center gap-1">
                            <div className="w-2.5 h-2.5 rounded-sm border border-black/10" style={{ background: color }} />
                            <span className="text-[9px] text-gray-500">{label}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <>
                        <div
                          className="h-2 rounded-full"
                          style={{
                            background: `linear-gradient(to right, ${layer.colorRamp.join(", ")})`,
                          }}
                        />
                        <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
                          <span>{layer.valueRange[0]}</span>
                          <span>{layer.valueRange[1]} {layer.unit}</span>
                        </div>
                      </>
                    )}
                  </div>
              
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Drainage proxy note */}
      <div className="mt-5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-[10px] font-semibold text-amber-800 mb-1">
          Note on Drainage Data
        </p>
        <p className="text-[10px] text-amber-700 leading-relaxed">
          Drainage infrastructure data is unavailable for Legazpi City. The
          system uses flow accumulation, slope, LULC, and SRTM 30m elevation as
          proxy indicators for urban flood accumulation behavior.
        </p>
      </div>
    </div>
  );
}
