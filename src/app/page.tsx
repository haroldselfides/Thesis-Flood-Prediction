import Header from "@/components/layout/Header";
import Sidebar from "@/components/sidebar/Sidebar";
import MapView from "@/components/map/MapView";

/**
 * HOME PAGE — Main dashboard view
 *
 * Layout:
 * ┌──────────────────────────────────────┐
 * │  Header (nav bar, search, links)     │
 * ├──────────┬───────────────────────────┤
 * │ Sidebar  │                           │
 * │ (layers, │       Map View            │
 * │ predict, │   (Leaflet + GeoTIFF)     │
 * │ results) │                           │
 * └──────────┴───────────────────────────┘
 *
 * TEAM OWNERSHIP:
 * - Romi:    Sidebar + prediction controls
 * - Kenn:    Map rendering + spatial layers
 * - Harold:  Backend API + model integration
 */
export default function HomePage() {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 relative">
          <MapView />
        </main>
      </div>
    </div>
  );
}
