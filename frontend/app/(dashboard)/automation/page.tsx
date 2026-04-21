"use client";

import AutomationList from "@/components/automation/AutomationList";

export default function AutomationPage() {
  return (
    <div className="space-y-5">
      <div className="brand-info-strip rounded-[26px] p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Flow operations
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Launch lead-capture flows, monitor live status, and keep your
          Instagram automation stack organized in one workspace. AI reply steps
          use credits, while template replies stay free.
        </p>
      </div>

      <section className="brand-section-shell rounded-[30px] p-4 sm:p-5 lg:p-6">
        <AutomationList />
      </section>
    </div>
  );
}
