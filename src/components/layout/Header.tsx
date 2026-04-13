"use client";

import { useState } from "react";
import { useAppState, useAppDispatch } from "@/hooks/useAppState";
import {
  Menu,
  Search,
  Info,
  FileText,
  AlertTriangle,
  X,
} from "lucide-react";

export default function Header() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [searchQuery, setSearchQuery] = useState("");
  const [showLimitations, setShowLimitations] = useState(false);

  return (
    <>
      <header
        className="h-14 bg-brand-950 text-white flex items-center px-4 gap-3 shrink-0 z-50"
        style={{ height: "var(--header-height)" }}
      >
        {/* Sidebar toggle */}
        <button
          onClick={() => dispatch({ type: "TOGGLE_SIDEBAR" })}
          className="p-1.5 rounded-md hover:bg-brand-800 transition-colors"
          aria-label="Toggle sidebar"
        >
          <Menu size={20} />
        </button>

        {/* Logo / Title */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-brand-500 flex items-center justify-center">
            <AlertTriangle size={16} className="text-white" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-sm font-display font-semibold leading-tight">
              Legazpi City Flood Hazard System
            </h1>
            <p className="text-[10px] text-brand-300 leading-tight">
              Torque Clustering + XGBoost
            </p>
          </div>
        </div>

        {/* Search barangay */}
        <div className="flex-1 max-w-sm mx-auto">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search barangay..."
              className="w-full bg-brand-900 text-sm text-white placeholder:text-brand-500 rounded-md py-1.5 pl-8 pr-3 border border-brand-700 focus:outline-none focus:border-brand-400 transition-colors"
            />
          </div>
        </div>

        {/* Right nav */}
        <nav className="flex items-center gap-1">
          <button
            onClick={() => setShowLimitations(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-brand-800 rounded-md transition-colors"
          >
            <AlertTriangle size={14} />
            <span className="hidden md:inline">Limitations</span>
          </button>
          <a
            href="/about"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-200 hover:bg-brand-800 rounded-md transition-colors"
          >
            <Info size={14} />
            <span className="hidden md:inline">About</span>
          </a>
        </nav>
      </header>

      {/* Limitations modal (PAGASA recommendation: always disclose) */}
      {showLimitations && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-amber-600">
                <AlertTriangle size={20} />
                <h2 className="font-display font-bold text-lg">
                  System Limitations
                </h2>
              </div>
              <button
                onClick={() => setShowLimitations(false)}
                className="p-1 rounded hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>
            <ul className="space-y-3 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                This system predicts rainfall-triggered flooding only. It does
                not account for riverine, coastal/tidal, or drainage overflow
                flooding.
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                Spatial factors (elevation, slope, geology, LULC) are static and
                may not reflect recent land use changes.
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                Satellite rainfall data (GPM IMERG) has been bias-corrected but
                may still differ from actual ground measurements.
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                <strong>
                  Drainage infrastructure data is unavailable and not included in
                  the model
                </strong>{" "}
                — this is the most critical urban flood factor (per PAGASA
                consultation).
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                Predictions are probabilistic estimates. Always follow official
                PAGASA and DRRM advisories.
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                Water level predictions are model-derived and should be
                cross-validated with gauge readings.
              </li>
            </ul>
            <div className="mt-5 pt-4 border-t text-xs text-gray-500">
              These limitations are disclosed per PAGASA-DOST consultation
              recommendations for transparent flood prediction systems.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
