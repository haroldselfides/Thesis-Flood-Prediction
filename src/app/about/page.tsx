import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-surface-1">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 mb-8"
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </Link>

        <h1 className="font-display text-3xl font-bold text-brand-950 mb-2">
          About This Study
        </h1>
        <p className="text-gray-500 mb-8">
          Predictive Spatial Flood Hazard Mapping and Visualization for Legazpi
          City Using Machine Learning
        </p>

        <div className="prose prose-sm max-w-none text-gray-700 space-y-6">
          <section>
            <h2 className="font-display text-lg font-bold text-brand-900">
              Overview
            </h2>
            <p>
              This web-based GIS application visualizes dynamic flood hazard maps
              for Legazpi City, Albay. It integrates Torque Clustering (a
              parameter-free unsupervised algorithm) with XGBoost to predict flood
              probability at the barangay level using 1-hour, 3-hour, and 6-hour
              prediction windows.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-brand-900">
              How It Works
            </h2>
            <p>
              The system uses 24 years of GPM IMERG satellite rainfall data
              (2000–2024) processed through Torque Clustering to identify natural
              rainfall behavior regimes. These cluster labels, combined with 7
              spatial flood conditioning factors processed in QGIS and ECMWF
              forecast rainfall, are fed into an XGBoost model that outputs
              per-barangay flood probabilities, predicted rainfall amounts, and
              estimated water levels.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-brand-900">
              Important Limitations
            </h2>
            <p>
              This system is a prototype visualization tool developed as an
              undergraduate thesis. It should not be used as a substitute for
              official PAGASA or DRRM advisories. Drainage infrastructure data —
              identified by PAGASA as the most critical urban flood factor — is
              unavailable and not included in the model.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-brand-900">
              Research Team
            </h2>
            <p>
              Rom-Ann May P. Balingbing, Gertrude Kenn L. Mujar, and Harold A.
              Selfides — BS Computer Science, Bicol University College of Science,
              December 2025.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
