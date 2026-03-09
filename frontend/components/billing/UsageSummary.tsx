"use client"

import { Zap, MessageSquare } from "lucide-react"

export default function UsageSummary({

aiUsed = 340,
aiLimit = 1000,
msgUsed = 120,
msgLimit = 500

}: any) {

const items = [

{
label:"AI Calls",
icon:<Zap size={16} className="text-blue-600"/>,
used:aiUsed,
limit:aiLimit,
desc:"monthly AI calls"
},

{
label:"Messages Sent",
icon:<MessageSquare size={16} className="text-blue-600"/>,
used:msgUsed,
limit:msgLimit,
desc:"monthly message limit"
}

]

return (

<div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm space-y-6">

{/* Header */}

<div className="flex items-center justify-between">

<h3 className="text-base sm:text-lg font-semibold text-gray-900">
Usage Summary
</h3>

<span className="text-xs text-gray-500">
Current Plan Usage
</span>

</div>


{/* Usage Blocks */}

{items.map((item)=>{

const percent = item.limit
? Math.min(Math.round((item.used/item.limit)*100),100)
: 0

let color="bg-blue-600"

if(percent>80) color="bg-red-500"
else if(percent>60) color="bg-yellow-500"

return(

<div key={item.label} className="space-y-2">

<div className="flex items-center justify-between">

<div className="flex items-center gap-2">

{item.icon}

<p className="text-sm font-medium text-gray-700">
{item.label}
</p>

</div>

<span className="text-xs text-gray-500 whitespace-nowrap">
{item.used} / {item.limit}
</span>

</div>


<div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">

<div
className={`${color} h-2 rounded-full transition-all duration-500`}
style={{ width: `${percent}%` }}
></div>

</div>

<p className="text-xs text-gray-500">
{percent}% of your {item.desc} used
</p>

</div>

)

})}


{/* Upgrade */}

<div className="pt-2">

<button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition">
Upgrade Plan
</button>

</div>

</div>

)

}