# Legazpi City Flood Hazard System

**Predictive Spatial Flood Hazard Mapping and Visualization for Legazpi City Using Machine Learning**

Torque Clustering + XGBoost | Next.js + Leaflet + FastAPI

---

## Quick Start

```bash
npm install
npm run dev
# Open http://localhost:3000
```

For the Python backend (model serving):
```bash
cd backend/
pip install fastapi uvicorn xgboost scikit-learn pandas numpy
uvicorn main:app --reload --port 8000
```

---

## Project Structure & Team Assignments

```
legazpi-flood-app/
├── src/
│   ├── app/                          # Next.js App Router pages
│   │   ├── layout.tsx                # Root layout (shared)
│   │   ├── page.tsx                  # Main dashboard (shared)
│   │   ├── globals.css               # Global styles (shared)
│   │   ├── about/page.tsx            # About page
│   │   ├── api/
│   │   │   ├── predict/route.ts      # Prediction API → FastAPI proxy
│   │   │   ├── ecmwf/route.ts        # ECMWF forecast data endpoint
│   │   │   └── spatial/route.ts      # Spatial layer metadata
│   │   └── dashboard/                # (future: historical data page)
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   └── Header.tsx            #  Top nav bar + search + limitations modal
│   │   ├── sidebar/
│   │   │   ├── Sidebar.tsx           #  Tab container
│   │   │   ├── LayersPanel.tsx       #  Spatial layer toggles
│   │   │   ├── PredictionPanel.tsx   #  Prediction window + ECMWF controls
│   │   │   ├── ResultsPanel.tsx      #  Per-barangay results display
│   │   │   └── InfoPanel.tsx         #  About + drainage proxy explanation
│   │   └── map/
│   │       ├── MapView.tsx           #  Dynamic import wrapper (SSR-safe)
│   │       ├── MapContent.tsx        #  Leaflet map + GeoTIFF layers + hazard overlay
│   │       ├── HazardLegend.tsx      #  Map legend overlay
│   │       └── ScaleBar.tsx          #  Scale bar overlay
│   │
│   ├── hooks/
│   │   └── useAppState.tsx           # Shared state (Context + Reducer)
│   │
│   ├── lib/
│   │   ├── constants.ts              # Layer definitions, hazard levels, thresholds
│   │   ├── utils.ts                  # Normalization, formatting, color interpolation
│   │   └── geotiff-loader.ts         # GeoTIFF loading + raster sampling utilities
│   │
│   ├── types/
│   │   └── index.ts                  # ALL shared TypeScript types
│   │
│   └── data/                         # (future: static barangay data, mock datasets)
│
├── public/
│   └── spatial/                      # ⬅️ PUT YOUR QGIS EXPORTS HERE
│       ├── barangays.geojson         # Barangay boundaries (EPSG:4326)
│       ├── elevation.tif             # DEM layer
│       ├── slope.tif                 # Slope layer
│       ├── flow_accumulation.tif     # Flow accumulation
│       ├── distance_from_river.tif   # Distance from river
│       ├── lulc.tif                  # Land use / land cover
│       ├── geology.tif               # Geology
│       └── rainfall_intensity.tif    # Rainfall intensity
│
├── backend/                          # ⬅️ : Python FastAPI backend
│   ├── main.py                       # FastAPI app
│   ├── model/                        # Trained XGBoost + Torque Clustering models
│   ├── preprocessing/                # Feature engineering pipeline
│   └── ecmwf/                        # ECMWF API client
│
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── next.config.js
```

---

## Team Ownership

###  — Sidebar, UI Controls, Prediction Interface
**Files:** `components/layout/`, `components/sidebar/`, `hooks/`

Responsibilities:
- Sidebar tabbed interface (layers, prediction, results, info)
- Prediction window selection (1h, 3h, 6h)
- ECMWF data fetch trigger
- Results display per barangay (flood probability, rainfall, water level)
- Hazard classification display with color coding
- Limitations modal (PAGASA requirement)
- Search barangay functionality

###  — Map Rendering, Spatial Layers, GeoTIFF Integration
**Files:** `components/map/`, `lib/geotiff-loader.ts`

Responsibilities:
- Leaflet map initialization and controls
- Loading GeoTIFF layers exported from QGIS
- Barangay boundary rendering (GeoJSON)
- Hazard overlay coloring based on prediction results
- Color ramp rendering for each spatial layer
- Map interactions (click barangay, zoom, pan)
- Legend and scale bar overlays

**QGIS Export Checklist for :**
1. Each layer → Export → Save As → GeoTIFF
2. CRS: **EPSG:4326** (WGS84) — required for Leaflet
3. Place in `public/spatial/<layer_name>.tif`
4. Barangay boundaries → Export as GeoJSON in EPSG:4326
5. Verify file sizes are reasonable (< 50MB each for web)

###  — Backend API, Model Integration, ECMWF Pipeline
**Files:** `app/api/`, `backend/`

Responsibilities:
- FastAPI backend serving XGBoost predictions
- Torque Clustering integration in prediction pipeline
- ECMWF forecast data fetching and processing
- Bias correction pipeline (IMERG vs PAGASA ground data)
- API route proxying from Next.js → FastAPI
- Model versioning and accuracy tracking
- Water level prediction module

---

## QGIS → Web App Pipeline

```
QGIS Layers (EPSG:32651)
         │
         ▼
   Export as GeoTIFF
   Reproject to EPSG:4326
         │
         ▼
   public/spatial/*.tif
         │
         ▼
   georaster-layer-for-leaflet
         │
         ▼
   Rendered on Leaflet map
```

### Steps to export from QGIS:
1. Right-click layer → **Export → Save As...**
2. Format: **GeoTIFF**
3. CRS: **EPSG:4326** (click the globe icon and search "4326")
4. File name: use the exact names above (e.g., `elevation.tif`)
5. Save to `public/spatial/` in this project
6. For vector layers (barangays): Export as **GeoJSON** with EPSG:4326

---

## Features Implemented (from PAGASA Interview)

| # | Feature | Status |
|---|---------|--------|
| 1 | Real-time rainfall monitoring | ⏳ Postponed |
| 2 | 1h, 3h, 6h prediction windows | ✅ Implemented |
| 3 | Flood susceptibility per barangay | ✅ Implemented |
| 4 | Rainfall + water level display | ✅ Implemented |
| 5 | City-level localized system | ✅ Implemented |
| 6 | Limitations disclosure | ✅ Implemented |
| 7 | Ground data coordination | ⏳ Pending (PAGASA/DRRM) |

---

## Addressing the Drainage Data Gap

Since drainage infrastructure data is unavailable, we use these proxies:

1. **Flow accumulation** — natural drainage paths from DEM
2. **Slope < 3°** — flat areas = water stagnation (like overwhelmed drains)
3. **LULC impervious surfaces** — urban areas forcing all rain to surface runoff
4. **SRTM 30m depressions** — topographic sinks matching historical flood zones
5. **CDRRMO flood records** — ground-truth of actual flood locations

Additionally, SRTM 30m data can reveal historical flooding patterns by
identifying low-lying depressions that serve as natural collection points.

---

## Accuracy Target

Per PAGASA consultation:
- Physical model baseline: **70%**
- ML system baseline: **≥80%**
- Target: **90%** if achievable
- Previous ML visitors achieved **80-90%**

---

## Environment Variables

Create `.env.local`:
```
FASTAPI_URL=http://localhost:8000
ECMWF_API_KEY=your_ecmwf_api_key
```
