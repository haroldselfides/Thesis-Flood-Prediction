import type { Metadata } from "next";
import { AppStateProvider } from "@/hooks/useAppState";
import "./globals.css";

export const metadata: Metadata = {
  title: "Legazpi City Flood Hazard System",
  description:
    "Predictive Spatial Flood Hazard Mapping and Visualization for Legazpi City Using Machine Learning — Torque Clustering & XGBoost",
  keywords: [
    "flood hazard",
    "Legazpi City",
    "machine learning",
    "XGBoost",
    "torque clustering",
    "GIS",
    "DRRM",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-surface-0 text-brand-950 antialiased">
        <AppStateProvider>{children}</AppStateProvider>
      </body>
    </html>
  );
}
