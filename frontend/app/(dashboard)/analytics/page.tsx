"use client"

import AnalyticsLayout from "@/components/analytics/AnalyticsLayout"
import FeatureGate from "@/components/FeatureGate"

export default function AnalyticsPage(){

return(

<div className="space-y-6">

{/* ===== HEADER ===== */}

<div>

<h1 className="text-xl font-semibold text-gray-900">
Analytics
</h1>

<p className="text-sm text-gray-500 mt-1">
Deep insights into leads, conversations and conversions
</p>

</div>

{/* 🔒 FULL LOCK (HIGH VALUE FEATURE) */}

<div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-6 shadow-sm">
  <FeatureGate feature="CRM">
    <AnalyticsLayout/>
  </FeatureGate>
</div>

</div>

)

}