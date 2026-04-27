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
  FlaskConical,
  Radio,
} from "lucide-react";

// Rainfall scenario presets for simulation mode
const SCENARIOS = [
  { label: "No Rain",   rain_1hr: 0,   rain_3hr: 0,   rain_6hr: 0   },
  { label: "Light",     rain_1hr: 2,   rain_3hr: 6,   rain_6hr: 12  },
  { label: "Moderate",  rain_1hr: 8,   rain_3hr: 24,  rain_6hr: 48  },
  { label: "Heavy",     rain_1hr: 20,  rain_3hr: 60,  rain_6hr: 120 },
  { label: "Typhoon",   rain_1hr: 40,  rain_3hr: 120, rain_6hr: 240 },
  { label: "Extreme",   rain_1hr: 80,  rain_3hr: 240, rain_6hr: 480 },
];

type InputMode = "live" | "simulate";

export default function PredictionPanel() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const [inputMode, setInputMode] = useState<InputMode>("live");

  // Live ECMWF state
  const [ecmwfStatus, setEcmwfStatus] = useState<
    "idle" | "fetching" | "ready" | "error"
  >("idle");
  const [ecmwfData, setEcmwfData] = useState<{
    rain_1hr_mm: number;
    rain_3hr_mm: number;
    rain_6hr_mm: number;
    forecast_time: string;
    stale_forecast?: boolean;
  } | null>(null);

  // Simulation state
  const [simRain1hr, setSimRain1hr] = useState(0);
  const [simRain3hr, setSimRain3hr] = useState(0);
  const [simRain6hr, setSimRain6hr] = useState(0);

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

  // ── Apply scenario preset ─────────────────────────────────────────────────
  const applyScenario = (s: (typeof SCENARIOS)[number]) => {
    setSimRain1hr(s.rain_1hr);
    setSimRain3hr(s.rain_3hr);
    setSimRain6hr(s.rain_6hr);
  };

  // ── Transform raw FastAPI response → ResultsPanel format ─────────────────
  const transformResult = (raw: Record<string, unknown>, windowKey: string) => {
    const windowMap: Record<string, string> = { "1h": "1hr", "3h": "3hr", "6h": "6hr" };
    const windowApi = windowMap[windowKey] ?? "3hr";

    const rainfallMm =
      windowApi === "1hr"
        ? (raw.rain_1hr_mm as number) ?? 0
        : windowApi === "6hr"
        ? (raw.rain_6hr_mm as number) ?? 0
        : (raw.rain_3hr_mm as number) ?? 0;

    const barangays = raw.barangays as string[];
    const probs = raw.flood_probability as number[];
    const nBarangays = raw.n_barangays as number;

    const barangayHazards = barangays.map((name, i) => {
      const prob = probs[i] ?? 0;
      const level =
        prob >= 0.75 ? "very_high"
        : prob >= 0.5 ? "high"
        : prob >= 0.25 ? "moderate"
        : prob >= 0.1 ? "low"
        : "very_low";
      return {
        barangayId: `brgy_${String(i).padStart(3, "0")}`,
        barangayName: name,
        hazardLevel: level as "very_high" | "high" | "moderate" | "low" | "very_low",
        floodProbability: prob,
        predictedRainfall: rainfallMm,
        contributingFactors: [],
      };
    });

    const affectedCount = barangayHazards.filter((b) => b.floodProbability >= 0.5).length;
    const overallLevel =
      affectedCount > nBarangays * 0.5 ? "high"
      : affectedCount > nBarangays * 0.25 ? "moderate"
      : "low";

    return {
      window: windowKey,
      timestamp: raw.forecast_time as string,
      barangayHazards,
      citySummary: {
        overallHazardLevel: overallLevel as "very_high" | "high" | "moderate" | "low" | "very_low",
        totalPredictedRainfall: rainfallMm,
        affectedBarangays: affectedCount,
        totalBarangays: nBarangays,
      },
      modelInfo: { version: "1.0.0", accuracy: 0.84, lastTrained: "2025-12-01" },
      limitations: [],
      barangays: raw.barangays,
      flood_probability: raw.flood_probability,
      simulated: raw.simulated as boolean,
      stale_forecast: raw.stale_forecast as boolean,
    };
  };

  // ── Run prediction (live or simulate) ────────────────────────────────────
  const handlePredict = async () => {
    dispatch({ type: "SET_PREDICTING", payload: true });
    try {
      const windowMap: Record<string, string> = { "1h": "1hr", "3h": "3hr", "6h": "6hr" };
      const window = windowMap[state.predictionWindow] ?? "3hr";

      let res: Response;
      if (inputMode === "simulate") {
        const params = new URLSearchParams({
          rain_1hr: String(simRain1hr),
          rain_3hr: String(simRain3hr),
          rain_6hr: String(simRain6hr),
          window,
        });
        res = await fetch(`/api/predict/simulate?${params}`, { cache: "no-store" });
      } else {
        res = await fetch(`/api/predict?window=${window}`, { cache: "no-store" });
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.error ?? `Predict failed: ${res.status}`);
      }

      const raw = await res.json();
      const transformed = transformResult(raw, state.predictionWindow);
      dispatch({ type: "SET_PREDICTION", payload: transformed });
      dispatch({ type: "SET_SIDEBAR_TAB", payload: "results" });
    } catch (error) {
      console.error("Prediction failed:", error);
    } finally {
      dispatch({ type: "SET_PREDICTING", payload: false });
    }
  };

  // ── Slider helper ─────────────────────────────────────────────────────────
  const RainfallSlider = ({
    label,
    value,
    onChange,
    max = 300,
  }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    max?: number;
  }) => (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[11px] text-gray-500 font-medium">{label}</span>
        <span className="text-[11px] font-bold text-brand-700">{value} mm</span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full accent-brand-600 cursor-pointer"
      />
      <div className="flex justify-between text-[9px] text-gray-300 mt-0.5">
        <span>0</span>
        <span>{max / 2}</span>
        <span>{max} mm</span>
      </div>
    </div>
  );

  return (
    <div className="p-4">
      <h3 className="font-display font-semibold text-sm text-brand-900 mb-1">
        Flood Prediction
      </h3>
      <p className="text-xs text-gray-500 mb-5">
        Select a prediction window and generate the dynamic flood hazard map
        using Torque Clustering + XGBoost.
      </p>

      {/* Prediction Window */}
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
                dispatch({ type: "SET_PREDICTION_WINDOW", payload: pw.value })
              }
              className={`py-2.5 px-2 rounded-lg text-center transition-all border ${
                isActive
                  ? "bg-brand-600 text-white border-brand-600 shadow-sm"
                  : "bg-white text-brand-800 border-surface-3 hover:border-brand-300 hover:bg-brand-50"
              }`}
            >
              <div className="text-sm font-bold font-display">{pw.label}</div>
              <div className={`text-[9px] mt-0.5 ${isActive ? "text-brand-100" : "text-gray-400"}`}>
                {pw.description}
              </div>
            </button>
          );
        })}
      </div>

      {/* Rainfall Input Mode Toggle */}
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
        <CloudRain size={12} className="inline mr-1" />
        Rainfall Input
      </label>
      <div className="flex gap-1.5 mb-4 p-1 bg-surface-1 border border-surface-3 rounded-lg">
        <button
          onClick={() => setInputMode("live")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all ${
            inputMode === "live"
              ? "bg-white text-brand-700 shadow-sm border border-surface-3"
              : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <Radio size={12} />
          Live ECMWF
        </button>
        <button
          onClick={() => setInputMode("simulate")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all ${
            inputMode === "simulate"
              ? "bg-white text-brand-700 shadow-sm border border-surface-3"
              : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <FlaskConical size={12} />
          Simulate
        </button>
      </div>

      {/* Live ECMWF Panel */}
      {inputMode === "live" && (
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
                ? ecmwfData?.stale_forecast ? "Cached" : "Ready"
                : ecmwfStatus === "fetching"
                ? "Fetching..."
                : ecmwfStatus === "error"
                ? "Error"
                : "Not loaded"}
            </span>
          </div>

          {ecmwfData && ecmwfStatus === "ready" && (
            <>
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
              {ecmwfData.stale_forecast && (
                <p className="text-[10px] text-amber-600 mb-2">
                  ECMWF was rate-limited — showing cached forecast.
                </p>
              )}
            </>
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
      )}

      {/* Simulation Panel */}
      {inputMode === "simulate" && (
        <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 mb-5">
          <p className="text-[10px] text-amber-700 mb-3 font-medium">
            Simulation mode — rainfall values are set manually. No ECMWF request is made.
          </p>

          {/* Scenario presets */}
          <div className="grid grid-cols-3 gap-1 mb-4">
            {SCENARIOS.map((s) => (
              <button
                key={s.label}
                onClick={() => applyScenario(s)}
                className={`py-1.5 px-1 rounded text-[10px] font-medium text-center border transition-all ${
                  simRain3hr === s.rain_3hr && simRain1hr === s.rain_1hr
                    ? "bg-amber-500 text-white border-amber-500"
                    : "bg-white text-gray-600 border-surface-3 hover:border-amber-300 hover:bg-amber-50"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Sliders */}
          <RainfallSlider
            label="1-hour rainfall (mm)"
            value={simRain1hr}
            onChange={setSimRain1hr}
          />
          <RainfallSlider
            label="3-hour rainfall (mm)"
            value={simRain3hr}
            onChange={setSimRain3hr}
          />
          <RainfallSlider
            label="6-hour rainfall (mm)"
            value={simRain6hr}
            onChange={setSimRain6hr}
            max={600}
          />
        </div>
      )}

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

      {/* Run Prediction */}
      <button
        onClick={handlePredict}
        disabled={state.isPredicting}
        className={`w-full py-3 rounded-lg font-display font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 ${
          inputMode === "simulate"
            ? "bg-amber-500 text-white hover:bg-amber-600"
            : "bg-brand-600 text-white hover:bg-brand-700"
        }`}
      >
        {state.isPredicting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Running Prediction...
          </>
        ) : (
          <>
            {inputMode === "simulate" ? <FlaskConical size={16} /> : <Zap size={16} />}
            {inputMode === "simulate" ? "Run Simulation" : "Generate Flood Hazard Map"}
          </>
        )}
      </button>

      {/* Footer note */}
      <div className={`mt-4 p-2.5 rounded-lg border flex gap-1.5 items-start ${
        inputMode === "simulate"
          ? "bg-amber-50 border-amber-200"
          : "bg-blue-50 border-blue-200"
      }`}>
        <AlertCircle
          size={13}
          className={`shrink-0 mt-0.5 ${inputMode === "simulate" ? "text-amber-500" : "text-blue-500"}`}
        />
        <p className={`text-[10px] leading-relaxed ${inputMode === "simulate" ? "text-amber-700" : "text-blue-700"}`}>
          {inputMode === "simulate"
            ? "Simulation uses manually set rainfall values — bypasses ECMWF entirely. Useful for extreme scenario analysis and thesis demonstrations."
            : "Rainfall input uses live ECMWF open data forecast for Legazpi City. Predictions run on all 71 barangays simultaneously using XGBoost."}
        </p>
      </div>
    </div>
  );
}
