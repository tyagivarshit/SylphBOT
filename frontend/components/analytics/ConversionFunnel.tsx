"use client"

export default function ConversionFunnel(){

const stages = [
{label:"Leads",value:540},
{label:"Interested",value:310},
{label:"Qualified",value:180},
{label:"Booked",value:64}
]

return(

<div className="bg-white border border-gray-200 rounded-xl p-5">

<h2 className="text-sm font-semibold text-gray-900 mb-4">
Conversion Funnel
</h2>

<div className="space-y-3">

{stages.map((s,i)=>(

<div key={i} className="flex justify-between text-sm">

<span className="text-gray-600">{s.label}</span>

<span className="font-medium text-gray-900">
{s.value}
</span>

</div>

))}

</div>

</div>

)

}
