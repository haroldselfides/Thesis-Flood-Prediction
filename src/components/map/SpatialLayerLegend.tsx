"use client";

import { SPATIAL_LAYERS, LULC_CLASSES, GEOLOGY_CLASSES} from "@/lib/constants";
import { useAppState } from "@/hooks/useAppState";

function getCategoricalClasses(layerId: string) {
    if(layerId === "lulc") return LULC_CLASSES;
    if(layerId === "geology") return GEOLOGY_CLASSES;
    return null;
}

export default function SpatialLayerLegend() {
  const { visibleLayers } = useAppState();

  // Show legend for the last toggled-on spatial layer
  const activeLayers = visibleLayers.filter(
    (id) => id in SPATIAL_LAYERS
  );

  if (activeLayers.length === 0) return null;

  // Use the most recently visible layer (last in array)
  const activeId = activeLayers[activeLayers.length - 1];
  const layer = SPATIAL_LAYERS[activeId as keyof typeof SPATIAL_LAYERS];
  if (!layer) return null;

  
  const isCategorical = (layer as any).categorical;

  return (
    <div className="absolute bottom-16 left-4 z-[1000] bg-white rounded-xl
                    shadow-lg border border-surface-3 p-3 min-w-[180px] max-w-[220px]">
      {/* Title */}
      <p className="font-display font-bold text-xs text-brand-900 mb-2 uppercase tracking-wide">
        {layer.label}
      </p>
      

      {isCategorical ? (
        // Categorical — show class swatches
        <div className="space-y-1">
          {Object.entries(getCategoricalClasses(activeId)?? {}).map(([code, { label, color }]) => (
            <div key={code} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-sm flex-shrink-0 border border-black/10"
                style={{ background: color }}
              />
              <span className="text-xs text-gray-700">{label}</span>
            </div>
          ))}
        </div>
      ) : (
        // Continuous — show color ramp + min/max
        <div>
          <div
            className="h-3 rounded-full w-full"
            style={{
              background: `linear-gradient(to right, ${layer.colorRamp.join(", ")})`,
            }}
          />
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>{layer.valueRange[0]}</span>
            <span>{layer.valueRange[1]} {layer.unit}</span>
          </div>
        </div>
      )}
    </div>
  );
}