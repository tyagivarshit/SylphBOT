"use client"

export default function TopSources(){

const sources = [
{name:"Instagram",value:320},
{name:"WhatsApp",value:180},
{name:"Website",value:40}
]

return(

<div className="bg-white border border-gray-200 rounded-xl p-5">

<h2 className="text-sm font-semibold text-gray-900 mb-4">
Top Lead Sources
</h2>

<div className="space-y-3">

{sources.map((s,i)=>(

<div key={i} className="flex justify-between text-sm">

<span className="text-gray-600">
{s.name}
</span>

<span className="font-medium text-gray-900">
{s.value}
</span>

</div>

))}

</div>

</div>

)

}
