"use client";

import { useAppState, useAppDispatch } from "@/hooks/useAppState";
import { getHazardColor, getHazardClassification, HAZARD_CLASSIFICATIONS } from "@/lib/constants";
import { formatRainfall, formatWaterLevel, formatProbability } from "@/lib/utils";
import { AlertTriangle, Droplets, Waves, MapPin, ChevronDown, ChevronUp, Download } from "lucide-react";
import { useState } from "react";
import type { BarangayHazard } from "@/types";

export default function ResultsPanel() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [expandedBarangay, setExpandedBarangay] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"risk" | "name">("risk");

  const prediction = state.prediction;

  if (!prediction) {
    return (
      <div className="p-4">
        <h3 className="font-display font-semibold text-sm text-brand-900 mb-1">
          Prediction Results
        </h3>
        <div className="mt-8 flex flex-col items-center text-center px-4">
          <div className="w-16 h-16 rounded-full bg-surface-2 flex items-center justify-center mb-3">
            <AlertTriangle size={24} className="text-gray-300" />
          </div>
          <p className="text-sm text-gray-500 font-medium">No prediction yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Go to the Predict tab, select a window, and generate a flood hazard map.
          </p>
        </div>
      </div>
    );
  }

  const { citySummary, barangayHazards, modelInfo, limitations } = prediction;

  // Sort barangays
  const sorted = [...barangayHazards].sort((a, b) => {
    if (sortBy === "risk") return b.floodProbability - a.floodProbability;
    return a.barangayName.localeCompare(b.barangayName);
  });

  const summaryHazard = getHazardClassification(
    citySummary.overallHazardLevel === "very_high"
      ? 0.9
      : citySummary.overallHazardLevel === "high"
      ? 0.7
      : citySummary.overallHazardLevel === "moderate"
      ? 0.5
      : citySummary.overallHazardLevel === "low"
      ? 0.3
      : 0.1
  );

  return (
    <div className="p-4">
      <h3 className="font-display font-semibold text-sm text-brand-900 mb-1">
        Prediction Results
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        {state.predictionWindow} window — {prediction.timestamp}
      </p>

      {/* City-wide summary card */}
      <div
        className="rounded-xl p-4 mb-4 border-2 animate-slide-up"
        style={{
          borderColor: summaryHazard.color,
          background: `${summaryHazard.color}10`,
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-3 h-3 rounded-full hazard-pulse"
            style={{ background: summaryHazard.color }}
          />
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: summaryHazard.color }}>
            {summaryHazard.label} Risk — City-wide
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-lg p-2.5 border border-surface-3 col-span-2">
            <div className="flex items-center gap-1 text-[10px] text-gray-400 mb-0.5">
              <Droplets size={10} /> Predicted Rainfall
            </div>
            <div className="text-lg font-display font-bold text-brand-900">
              {formatRainfall(citySummary.totalPredictedRainfall)}
            </div>
          </div>
          {/* <div className="bg-white rounded-lg p-2.5 border border-surface-3">
            <div className="flex items-center gap-1 text-[10px] text-gray-400 mb-0.5">
              <Waves size={10} /> Predicted Water Level
            </div>
            <div className="text-lg font-display font-bold text-brand-900">
              {citySummary.predictedWaterLevel
                ? formatWaterLevel(citySummary.predictedWaterLevel)
                : "—"}
            </div>
          </div> */}
          <div className="bg-white rounded-lg p-2.5 border border-surface-3 col-span-2">
            <div className="flex items-center gap-1 text-[10px] text-gray-400 mb-0.5">
              <MapPin size={10} /> Affected Barangays
            </div>
            <div className="text-lg font-display font-bold text-brand-900">
              {citySummary.affectedBarangays}{" "}
              <span className="text-xs font-normal text-gray-400">
                / {citySummary.totalBarangays}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sort controls */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
          Per-Barangay Results
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setSortBy("risk")}
            className={`text-[10px] px-2 py-1 rounded ${
              sortBy === "risk" ? "bg-brand-100 text-brand-700 font-medium" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            By Risk
          </button>
          <button
            onClick={() => setSortBy("name")}
            className={`text-[10px] px-2 py-1 rounded ${
              sortBy === "name" ? "bg-brand-100 text-brand-700 font-medium" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            A–Z
          </button>
        </div>
      </div>

      {/* Barangay list */}
      <div className="space-y-1.5 mb-4">
        {sorted.map((brgy, i) => {
          const hazard = getHazardClassification(brgy.floodProbability);
          const isExpanded = expandedBarangay === brgy.barangayId;
          const isSelected = state.selectedBarangay === brgy.barangayId;

          return (
            <div
              key={brgy.barangayId}
              className={`rounded-lg border transition-all animate-slide-up ${
                isSelected
                  ? "border-brand-400 bg-brand-50/50 shadow-sm"
                  : "border-surface-3 bg-white hover:border-brand-200"
              }`}
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
                onClick={() => {
                  dispatch({ type: "SELECT_BARANGAY", payload: brgy.barangayId });
                  setExpandedBarangay(isExpanded ? null : brgy.barangayId);
                }}
              >
                {/* Hazard dot */}
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: hazard.color }}
                />

                {/* Name + probability */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-brand-900 truncate">
                    {brgy.barangayName}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {formatRainfall(brgy.predictedRainfall)} •{" "}
                    {brgy.predictedWaterLevel
                      ? formatWaterLevel(brgy.predictedWaterLevel)
                      : "—"}
                  </div>
                </div>

                {/* Probability badge */}
                <div
                  className="text-xs font-bold font-display px-2 py-0.5 rounded-md"
                  style={{
                    color: hazard.color,
                    background: `${hazard.color}15`,
                  }}
                >
                  {formatProbability(brgy.floodProbability)}
                </div>

                {isExpanded ? (
                  <ChevronUp size={14} className="text-gray-300" />
                ) : (
                  <ChevronDown size={14} className="text-gray-300" />
                )}
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-0">
                  <div className="bg-surface-1 rounded-md p-2.5 text-[11px] space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Hazard Level</span>
                      <span className="font-semibold" style={{ color: hazard.color }}>
                        {hazard.label}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Flood Probability</span>
                      <span className="font-semibold text-brand-900">
                        {formatProbability(brgy.floodProbability)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Predicted Rainfall</span>
                      <span className="font-semibold text-brand-900">
                        {formatRainfall(brgy.predictedRainfall)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Predicted Water Level</span>
                      <span className="font-semibold text-brand-900">
                        {brgy.predictedWaterLevel
                          ? formatWaterLevel(brgy.predictedWaterLevel)
                          : "N/A"}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 pt-1 border-t border-surface-3">
                      {hazard.description}
                    </p>
                    {/* Contributing factors */}
                    {brgy.contributingFactors.length > 0 && (
                      <div className="pt-1 border-t border-surface-3">
                        <span className="text-[10px] text-gray-400 font-medium">
                          Top Contributing Factors:
                        </span>
                        <div className="mt-1 space-y-1">
                          {brgy.contributingFactors.slice(0, 3).map((f) => (
                            <div key={f.factor} className="flex items-center gap-2">
                              <div className="flex-1 bg-surface-3 rounded-full h-1.5">
                                <div
                                  className="h-full rounded-full bg-brand-500"
                                  style={{ width: `${f.contribution * 100}%` }}
                                />
                              </div>
                              <span className="text-[9px] text-gray-500 w-28 text-right">
                                {f.factor.replace(/_/g, " ")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Hazard legend */}
      <div className="bg-surface-1 rounded-lg p-3 border border-surface-3 mb-4">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
          Hazard Legend
        </span>
        <div className="mt-2 space-y-1">
          {HAZARD_CLASSIFICATIONS.map((h) => (
            <div key={h.level} className="flex items-center gap-2 text-[11px]">
              <div className="w-3 h-3 rounded-sm" style={{ background: h.color }} />
              <span className="font-medium text-gray-700">{h.label}</span>
              <span className="text-gray-400 ml-auto">
                {Math.round(h.range[0] * 100)}–{Math.round(h.range[1] * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Model info + download */}
      <div className="flex items-center justify-between text-[10px] text-gray-400">
        <span>
          Model v{modelInfo.version} • Accuracy: {Math.round(modelInfo.accuracy * 100)}%
        </span>
        <button className="flex items-center gap-1 text-brand-600 hover:text-brand-700 font-medium">
          <Download size={11} />
          Export
        </button>
      </div>
    </div>
  );
}
