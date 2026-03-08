"use client"

import { Zap, MessageSquare } from "lucide-react"

export default function UsageSummary() {

const aiUsed = 340
const aiLimit = 1000
const aiPercent = Math.round((aiUsed / aiLimit) * 100)

const msgUsed = 120
const msgLimit = 500
const msgPercent = Math.round((msgUsed / msgLimit) * 100)

return (

<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-6">

{/* Header */}

<div className="flex items-center justify-between">

<h3 className="text-lg font-semibold text-gray-900">
Usage Summary
</h3>

<span className="text-xs text-gray-500">
Current Plan Usage
</span>

</div>


{/* AI CALLS */}

<div className="space-y-2">

<div className="flex items-center justify-between">

<div className="flex items-center gap-2">

<Zap size={16} className="text-blue-600"/>

<p className="text-sm font-medium text-gray-700">
AI Calls
</p>

</div>

<span className="text-xs text-gray-500">
{aiUsed} / {aiLimit}
</span>

</div>

<div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">

<div
className="bg-blue-600 h-2 rounded-full transition-all"
style={{ width: `${aiPercent}%` }}
></div>

</div>

<p className="text-xs text-gray-500">
{aiPercent}% of your monthly AI calls used
</p>

</div>


{/* MESSAGES */}

<div className="space-y-2">

<div className="flex items-center justify-between">

<div className="flex items-center gap-2">

<MessageSquare size={16} className="text-blue-600"/>

<p className="text-sm font-medium text-gray-700">
Messages Sent
</p>

</div>

<span className="text-xs text-gray-500">
{msgUsed} / {msgLimit}
</span>

</div>

<div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">

<div
className="bg-blue-600 h-2 rounded-full transition-all"
style={{ width: `${msgPercent}%` }}
></div>

</div>

<p className="text-xs text-gray-500">
{msgPercent}% of your monthly message limit used
</p>

</div>


{/* Upgrade */}

<div className="pt-2">

<button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition">

Upgrade Plan

</button>

</div>

</div>

)

}