"use client";

import { useState } from "react";
import { useAppState, useAppDispatch } from "@/hooks/useAppState";
import { PREDICTION_WINDOWS } from "@/lib/constants";
import {
  Zap,
  Clock,
  CloudRain,
  Waves,
  Loader2,
  AlertCircle,
} from "lucide-react";

export default function PredictionPanel() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const [ecmwfStatus, setEcmwfStatus] = useState<
    "idle" | "fetching" | "ready" | "error"
  >("idle");

  const [ecmwfData, setEcmwfData] = useState<{
    rain_1hr_mm: number;
    rain_3hr_mm: number;
    rain_6hr_mm: number;
    forecast_time: string;
  } | null>(null);

  // ── Fetch ECMWF forecast ──────────────────────────────────────────────────
  const handleFetchECMWF = async () => {
    setEcmwfStatus("fetching");
    try {
      const res = await fetch("/api/ecmwf", { cache: "no-store" });
      if (!res.ok) throw new Error(`ECMWF fetch failed: ${res.status}`);
      const data = await res.json();
      setEcmwfData(data);
      setEcmwfStatus("ready");
    } catch (err) {
      console.error("ECMWF fetch error:", err);
      setEcmwfStatus("error");
    }
  };

  // ── Run prediction ────────────────────────────────────────────────────────
  const handlePredict = async () => {
    dispatch({ type: "SET_PREDICTING", payload: true });
    try {
      // Map UI window format (e.g. "1h") to API format ("1hr")
      const windowMap: Record<string, string> = {
        "1h": "1hr",
        "3h": "3hr",
        "6h": "6hr",
      };
      const window = windowMap[state.predictionWindow] ?? "3hr";

      const res = await fetch(`/api/predict?window=${window}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.error ?? `Predict failed: ${res.status}`);
      }

      const raw = await res.json();

      // ── Transform FastAPI response → format ResultsPanel expects ──────────
      //
      // FastAPI returns:
      //   { barangays: string[], flood_probability: number[], rain_3hr_mm, ... }
      //
      // ResultsPanel expects:
      //   { barangayHazards: BarangayHazard[], citySummary, modelInfo, ... }

      const rainfallMm =
        window === "1hr"
          ? raw.rain_1hr_mm ?? 0
          : window === "6hr"
          ? raw.rain_6hr_mm ?? 0
          : raw.rain_3hr_mm ?? 0;

      const barangayHazards = (raw.barangays as string[]).map(
        (name: string, i: number) => {
          const prob: number = raw.flood_probability[i] ?? 0;
          const level: "very_high" | "high" | "moderate" | "low" | "very_low" =
            prob >= 0.75
              ? "very_high"
              : prob >= 0.5
              ? "high"
              : prob >= 0.25
              ? "moderate"
              : prob >= 0.1
              ? "low"
              : "very_low";

          return {
            barangayId: `brgy_${String(i).padStart(3, "0")}`,
            barangayName: name,
            hazardLevel: level,
            floodProbability: prob,
            predictedRainfall: rainfallMm,
            predictedWaterLevel: undefined as number | undefined,
            contributingFactors: [],
          };
        }
      );

      const affectedCount = barangayHazards.filter(
        (b) => b.floodProbability >= 0.5
      ).length;

      const overallLevel: "very_high" | "high" | "moderate" | "low" | "very_low" =
        affectedCount > raw.n_barangays * 0.5
          ? "high"
          : affectedCount > raw.n_barangays * 0.25
          ? "moderate"
          : "low";

      const transformed = {
        window: state.predictionWindow,
        timestamp: raw.forecast_time,
        barangayHazards,
        citySummary: {
          overallHazardLevel: overallLevel,
          totalPredictedRainfall: rainfallMm,
          predictedWaterLevel: undefined as number | undefined,
          affectedBarangays: affectedCount,
          totalBarangays: raw.n_barangays,
        },
        modelInfo: {
          version: "1.0.0",
          accuracy: 0.84,
          lastTrained: "2025-12-01",
        },
        limitations: [],
        // Keep raw fields so MapContent hazard overlay still works
        barangays: raw.barangays,
        flood_probability: raw.flood_probability,
      };

      dispatch({ type: "SET_PREDICTION", payload: transformed });
      dispatch({ type: "SET_SIDEBAR_TAB", payload: "results" });
    } catch (error) {
      console.error("Prediction failed:", error);
    } finally {
      dispatch({ type: "SET_PREDICTING", payload: false });
    }
  };

  return (
    <div className="p-4">
      <h3 className="font-display font-semibold text-sm text-brand-900 mb-1">
        Flood Prediction
      </h3>
      <p className="text-xs text-gray-500 mb-5">
        Select a prediction window and generate the dynamic flood hazard map
        using Torque Clustering + XGBoost.
      </p>

      {/* Prediction Window Selection */}
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
        <Clock size={12} className="inline mr-1" />
        Prediction Window
      </label>
      <div className="grid grid-cols-3 gap-2 mb-5">
        {PREDICTION_WINDOWS.map((pw) => {
          const isActive = state.predictionWindow === pw.value;
          return (
            <button
              key={pw.value}
              onClick={() =>
                dispatch({
                  type: "SET_PREDICTION_WINDOW",
                  payload: pw.value,
                })
              }
              className={`py-2.5 px-2 rounded-lg text-center transition-all border ${
                isActive
                  ? "bg-brand-600 text-white border-brand-600 shadow-sm"
                  : "bg-white text-brand-800 border-surface-3 hover:border-brand-300 hover:bg-brand-50"
              }`}
            >
              <div className="text-sm font-bold font-display">{pw.label}</div>
              <div
                className={`text-[9px] mt-0.5 ${
                  isActive ? "text-brand-100" : "text-gray-400"
                }`}
              >
                {pw.description}
              </div>
            </button>
          );
        })}
      </div>

      {/* ECMWF Rainfall Forecast */}
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
        <CloudRain size={12} className="inline mr-1" />
        Rainfall Forecast Source (ECMWF)
      </label>
      <div className="bg-surface-1 rounded-lg p-3 border border-surface-3 mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-600">ECMWF Forecast Data</span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              ecmwfStatus === "ready"
                ? "bg-green-100 text-green-700"
                : ecmwfStatus === "fetching"
                ? "bg-blue-100 text-blue-700"
                : ecmwfStatus === "error"
                ? "bg-red-100 text-red-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {ecmwfStatus === "ready"
              ? "Ready"
              : ecmwfStatus === "fetching"
              ? "Fetching..."
              : ecmwfStatus === "error"
              ? "Error"
              : "Not loaded"}
          </span>
        </div>

        {/* Live ECMWF values */}
        {ecmwfData && ecmwfStatus === "ready" && (
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            {[
              { label: "1hr", value: ecmwfData.rain_1hr_mm },
              { label: "3hr", value: ecmwfData.rain_3hr_mm },
              { label: "6hr", value: ecmwfData.rain_6hr_mm },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-white rounded p-1.5 text-center border border-surface-3"
              >
                <div className="text-xs font-bold text-brand-700">
                  {item.value.toFixed(1)} mm
                </div>
                <div className="text-[9px] text-gray-400">{item.label}</div>
              </div>
            ))}
          </div>
        )}

        {ecmwfStatus === "error" && (
          <p className="text-[10px] text-red-500 mb-2">
            Could not fetch ECMWF data. Check that the backend is running.
          </p>
        )}

        <button
          onClick={handleFetchECMWF}
          disabled={ecmwfStatus === "fetching"}
          className="w-full text-xs py-2 rounded-md bg-brand-100 text-brand-700 hover:bg-brand-200 disabled:opacity-50 transition-colors font-medium"
        >
          {ecmwfStatus === "fetching" ? (
            <span className="flex items-center justify-center gap-1.5">
              <Loader2 size={13} className="animate-spin" />
              Fetching ECMWF data...
            </span>
          ) : ecmwfStatus === "ready" ? (
            "Refresh Forecast"
          ) : (
            "Fetch Latest Forecast"
          )}
        </button>

        <p className="text-[10px] text-gray-400 mt-2">
          Live rainfall forecast from ECMWF open data (13.1°N, 123.7°E).
        </p>
      </div>

      {/* Prediction Outputs */}
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
        <Waves size={12} className="inline mr-1" />
        Prediction Outputs
      </label>
      <div className="bg-surface-1 rounded-lg p-3 border border-surface-3 mb-5 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Flood probability per barangay</span>
          <span className="text-brand-600 font-medium">0–100%</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Barangays assessed</span>
          <span className="text-brand-600 font-medium">71</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Hazard classification</span>
          <span className="text-brand-600 font-medium">5 levels</span>
        </div>
      </div>

      {/* Run Prediction button */}
      <button
        onClick={handlePredict}
        disabled={state.isPredicting}
        className="w-full py-3 rounded-lg bg-brand-600 text-white font-display font-bold text-sm hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
      >
        {state.isPredicting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Running Prediction...
          </>
        ) : (
          <>
            <Zap size={16} />
            Generate Flood Hazard Map
          </>
        )}
      </button>

      {/* Note */}
      <div className="mt-4 p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex gap-1.5 items-start">
          <AlertCircle size={13} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-[10px] text-blue-700 leading-relaxed">
            Rainfall input uses live ECMWF open data forecast for Legazpi City.
            Predictions run on all 71 barangays simultaneously using XGBoost.
          </p>
        </div>
      </div>
    </div>
  );
}