"use client";

import { BookOpen, Database, AlertTriangle, Users } from "lucide-react";

export default function InfoPanel() {
  return (
    <div className="p-4 space-y-5">
      <div>
        <h3 className="font-display font-semibold text-sm text-brand-900 mb-1">
          About This System
        </h3>
        <p className="text-xs text-gray-500 leading-relaxed">
          Predictive Spatial Flood Hazard Mapping and Visualization for Legazpi
          City Using Machine Learning. An undergraduate thesis at Bicol
          University College of Science.
        </p>
      </div>

      {/* Methodology summary */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <BookOpen size={13} className="text-brand-600" />
          <span className="text-[11px] font-semibold text-brand-800">
            Methodology
          </span>
        </div>
        <div className="text-[11px] text-gray-600 leading-relaxed space-y-2">
          <p>
            The system integrates <strong>Torque Clustering</strong> (a
            parameter-free unsupervised algorithm) to identify natural rainfall
            behavior regimes from 24 years of GPM IMERG data. These cluster
            labels are fed alongside spatial and temporal features into an{" "}
            <strong>XGBoost</strong> model that predicts flood probability at
            1-hour, 3-hour, and 6-hour windows.
          </p>
          <p>
            Spatial flood conditioning factors (7 layers) from QGIS are combined
            with the rainfall predictions to generate a dynamic hazard map at the
            barangay level.
          </p>
        </div>
      </div>

      {/* Data sources */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Database size={13} className="text-brand-600" />
          <span className="text-[11px] font-semibold text-brand-800">
            Data Sources
          </span>
        </div>
        <div className="space-y-1.5">
          {[
            { label: "Rainfall (training)", value: "NASA GPM IMERG V07 (2000–2024)" },
            { label: "Rainfall (forecast)", value: "ECMWF model, cross-validated" },
            { label: "Historical floods", value: "CDRRMO Legazpi City (2025)" },
            { label: "DEM / Elevation", value: "SRTM 30m / ALOS PALSAR" },
            { label: "Geology", value: "MGB-DENR geological shapefiles" },
            { label: "Land Use / Land Cover", value: "NAMRIA LULC data" },
            { label: "River network", value: "NAMRIA / OpenStreetMap" },
            { label: "Barangay boundaries", value: "ArcGIS Online Legazpi dataset" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex justify-between text-[11px] py-1 border-b border-surface-2 last:border-0"
            >
              <span className="text-gray-500">{item.label}</span>
              <span className="text-brand-800 font-medium text-right max-w-[55%]">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Drainage proxy explanation */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <AlertTriangle size={13} className="text-amber-600" />
          <span className="text-[11px] font-semibold text-amber-800">
            Why No Drainage Data?
          </span>
        </div>
        <div className="text-[10px] text-amber-700 leading-relaxed space-y-1.5">
          <p>
            PAGASA identified drainage infrastructure as the most critical urban
            flood factor for Legazpi City. However, this data is unavailable from
            any accessible source.
          </p>
          <p>
            As alternatives, this system uses the following proxy indicators:
          </p>
          <ul className="space-y-1 ml-2">
            <li className="flex gap-1.5">
              <span className="shrink-0 mt-1 w-1 h-1 rounded-full bg-amber-500" />
              <span>
                <strong>Flow accumulation</strong> — natural drainage paths and
                water convergence zones from DEM
              </span>
            </li>
            <li className="flex gap-1.5">
              <span className="shrink-0 mt-1 w-1 h-1 rounded-full bg-amber-500" />
              <span>
                <strong>Slope &lt;3°</strong> — flat areas where water stagnates,
                mimicking overwhelmed storm drains
              </span>
            </li>
            <li className="flex gap-1.5">
              <span className="shrink-0 mt-1 w-1 h-1 rounded-full bg-amber-500" />
              <span>
                <strong>LULC impervious surfaces</strong> — urban areas where all
                rainfall becomes surface runoff
              </span>
            </li>
            <li className="flex gap-1.5">
              <span className="shrink-0 mt-1 w-1 h-1 rounded-full bg-amber-500" />
              <span>
                <strong>SRTM 30m low-lying depressions</strong> — topographic
                sinks that correlate with historical flood locations
              </span>
            </li>
            <li className="flex gap-1.5">
              <span className="shrink-0 mt-1 w-1 h-1 rounded-full bg-amber-500" />
              <span>
                <strong>CDRRMO flood records</strong> — ground-truth validation
                of actual flooding regardless of cause
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* Team */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Users size={13} className="text-brand-600" />
          <span className="text-[11px] font-semibold text-brand-800">
            Research Team
          </span>
        </div>
        <div className="text-[11px] text-gray-600 space-y-0.5">
          <p>Rom-Ann May P. Balingbing</p>
          <p>Gertrude Kenn L. Mujar</p>
          <p>Harold A. Selfides</p>
        </div>
        <p className="text-[10px] text-gray-400 mt-1">
          BS Computer Science — Bicol University College of Science, 2025
        </p>
      </div>
    </div>
  );
}
