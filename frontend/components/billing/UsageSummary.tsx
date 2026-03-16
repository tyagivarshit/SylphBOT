"use client"

import { Zap, MessageSquare } from "lucide-react"

export default function UsageSummary({

aiUsed = 340,
aiLimit = 1000,
msgUsed = 120,
msgLimit = 500

}: any){

const items = [

{
label:"AI Calls",
icon:<Zap size={16}/>,
used:aiUsed,
limit:aiLimit
},

{
label:"Messages Sent",
icon:<MessageSquare size={16}/>,
used:msgUsed,
limit:msgLimit
}

]

return(

<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-6">

<div className="flex justify-between items-center">

<h3 className="text-lg font-semibold text-gray-900">
Usage Summary
</h3>

<span className="text-xs text-gray-500">
Current Billing Cycle
</span>

</div>

{items.map((item)=>{

const percent = Math.min(Math.round((item.used/item.limit)*100),100)

return(

<div key={item.label} className="space-y-2">

<div className="flex justify-between text-sm">

<div className="flex items-center gap-2 text-gray-700">
{item.icon}
{item.label}
</div>

<span className="text-gray-500">
{item.used} / {item.limit}
</span>

</div>

<div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">

<div
className="h-2 bg-blue-600 rounded-full transition-all"
style={{width:`${percent}%`}}
></div>

</div>

<p className="text-xs text-gray-500">
{percent}% used this month
</p>

</div>

)

})}

<button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg">
Upgrade Plan
</button>

</div>

)
}
