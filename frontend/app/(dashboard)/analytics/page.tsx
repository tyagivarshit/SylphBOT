"use client"

import AnalyticsLayout from "@/components/analytics/AnalyticsLayout"
import FeatureGate from "@/components/FeatureGate"

export default function AnalyticsPage(){

return(

<div className="space-y-5">

<div className="brand-info-strip rounded-[26px] p-4 sm:p-5">

<p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
Performance view
</p>

<p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
Follow funnel movement, message activity, and conversion momentum from a cleaner reporting surface.
</p>

</div>

{/* 🔒 FULL LOCK (HIGH VALUE FEATURE) */}

<section className="brand-section-shell rounded-[30px] p-4 sm:p-5 lg:p-6">
  <FeatureGate feature="CRM">
    <AnalyticsLayout/>
  </FeatureGate>
</section>

</div>

)

}
