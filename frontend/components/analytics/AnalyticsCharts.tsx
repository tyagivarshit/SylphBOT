"use client"

import LeadsChart from "@/components/charts/LeadsCharts"

export default function AnalyticsCharts(){

const data = [
{date:"Mon",leads:12},
{date:"Tue",leads:18},
{date:"Wed",leads:10},
{date:"Thu",leads:22},
{date:"Fri",leads:15}
]

return(

<div className="grid md:grid-cols-2 gap-6">

<div className="bg-white border border-gray-200 rounded-xl p-5">

<h2 className="text-sm font-semibold text-gray-900 mb-4">
Lead Growth
</h2>

<LeadsChart data={data}/>

</div>

<div className="bg-white border border-gray-200 rounded-xl p-5">

<h2 className="text-sm font-semibold text-gray-900 mb-4">
Message Activity
</h2>

<LeadsChart data={data}/>

</div>

</div>

)

}
