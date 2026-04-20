"use client";

import dynamic from "next/dynamic";

const MapContent = dynamic(() => import("./MapContent"), {
  ssr: false,
  loading: () => (
    <div className="map-container flex items-center justify-center bg-brand-950">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-brand-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-brand-300 text-sm font-display">Loading map...</p>
        <p className="text-brand-500 text-xs mt-1">Initializing Legazpi City basemap</p>
      </div>
    </div>
  ),
});

export default function MapView() {
  return <MapContent />;
}