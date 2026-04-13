"use client";

import { HAZARD_CLASSIFICATIONS } from "@/lib/constants";

export default function HazardLegend() {
  return (
    <div className="absolute bottom-20 left-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-surface-3 px-3 py-2.5">
      <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        Flood Hazard Level
      </p>
      <div className="space-y-1">
        {HAZARD_CLASSIFICATIONS.map((h) => (
          <div key={h.level} className="flex items-center gap-2">
            <div
              className="w-4 h-2.5 rounded-sm"
              style={{ background: h.color }}
            />
            <span className="text-[10px] text-gray-700">{h.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
