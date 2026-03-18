"use client"

import AnalyticsLayout from "@/components/analytics/AnalyticsLayout"
import FeatureGate from "@/components/FeatureGate" // ✅ ADD

export default function AnalyticsPage(){

return(

<div className="space-y-6">

{/* ===== HEADER ===== */}

<div>

<h1 className="text-lg font-semibold text-gray-900">
Analytics
</h1>

<p className="text-sm text-gray-500 mt-1">
Deep insights into leads, conversations and conversions
</p>

</div>

{/* 🔒 FULL LOCK (HIGH VALUE FEATURE) */}

<FeatureGate feature="CRM">
  <AnalyticsLayout/>
</FeatureGate>

</div>

)

}