"use client";

export default function ScaleBar() {
  return (
    <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 backdrop-blur-sm rounded px-2.5 py-1.5 shadow border border-surface-3">
      <div className="flex items-center gap-2 text-[9px] text-gray-500">
        <div className="flex items-end gap-px">
          <div className="w-px h-2 bg-gray-400" />
          <div className="w-12 h-px bg-gray-400" />
          <div className="w-px h-2 bg-gray-400" />
          <div className="w-12 h-px bg-gray-400" />
          <div className="w-px h-2 bg-gray-400" />
        </div>
        <span>1 km</span>
      </div>
    </div>
  );
}
