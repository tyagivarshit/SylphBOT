"use client"

import AnalyticsLayout from "@/components/analytics/AnalyticsLayout"

export default function AnalyticsPage(){

return(

<div className="space-y-6">

<div>

<h1 className="text-lg font-semibold text-gray-900">
Analytics
</h1>

<p className="text-sm text-gray-500 mt-1">
Deep insights into leads, conversations and conversions
</p>

</div>

<AnalyticsLayout/>

</div>

)

}
