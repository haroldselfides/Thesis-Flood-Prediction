"use client";

import { useAppState, useAppDispatch } from "@/hooks/useAppState";
import { Layers, Zap, BarChart3, Info } from "lucide-react";
import LayersPanel from "./LayersPanel";
import PredictionPanel from "./PredictionPanel";
import ResultsPanel from "./ResultsPanel";
import InfoPanel from "./InfoPanel";

const TABS = [
  { id: "layers" as const, label: "Layers", icon: Layers },
  { id: "prediction" as const, label: "Predict", icon: Zap },
  { id: "results" as const, label: "Results", icon: BarChart3 },
  { id: "info" as const, label: "Info", icon: Info },
];

export default function Sidebar() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { sidebar } = state;

  if (!sidebar.isOpen) return null;

  return (
    <aside
      className="h-full bg-white border-r border-surface-3 flex flex-col shrink-0 z-40"
      style={{ width: "var(--sidebar-width)" }}
    >
      {/* Tab bar */}
      <div className="flex border-b border-surface-3 shrink-0">
        {TABS.map((tab) => {
          const isActive = sidebar.activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() =>
                dispatch({ type: "SET_SIDEBAR_TAB", payload: tab.id })
              }
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
                isActive
                  ? "text-brand-600 border-b-2 border-brand-500 bg-brand-50/50"
                  : "text-gray-400 hover:text-gray-600 hover:bg-surface-1"
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto sidebar-scroll">
        {sidebar.activeTab === "layers" && <LayersPanel />}
        {sidebar.activeTab === "prediction" && <PredictionPanel />}
        {sidebar.activeTab === "results" && <ResultsPanel />}
        {sidebar.activeTab === "info" && <InfoPanel />}
      </div>
    </aside>
  );
}
