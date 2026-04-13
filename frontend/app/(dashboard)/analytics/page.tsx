"use client"

import AnalyticsEnterprise from "@/components/analytics/AnalyticsEnterprise"
import FeatureGate from "@/components/FeatureGate"

export default function AnalyticsPage(){

return(

<div className="space-y-5">

<div className="brand-info-strip rounded-[26px] p-4 sm:p-5">

<p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
Revenue intelligence
</p>

<p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
Track live conversion momentum, channel quality, response health, and Elite-grade pipeline diagnostics from one analytics surface.
</p>

</div>

{/* 🔒 FULL LOCK (HIGH VALUE FEATURE) */}

<section className="brand-section-shell rounded-[30px] p-4 sm:p-5 lg:p-6">
  <FeatureGate feature="CRM">
    <AnalyticsEnterprise/>
  </FeatureGate>
</section>

</div>

)

}
