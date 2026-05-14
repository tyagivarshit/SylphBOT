"use client";

import AutonomousDashboard from "@/components/autonomous/AutonomousDashboard";
import FeatureGate from "@/components/FeatureGate";

export default function AutonomousPage() {
  return (
    <div className="space-y-5">
      <div className="brand-info-strip rounded-[26px] p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Autonomous revenue ops
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          See which leads the engine wants to revive, retain, expand, or win
          back, and inspect the guardrails that keep proactive outreach ethical.
        </p>
      </div>

      <section className="brand-section-shell rounded-[30px] p-4 sm:p-5 lg:p-6">
        <FeatureGate feature="CRM">
          <AutonomousDashboard />
        </FeatureGate>
      </section>
    </div>
  );
}
