"use client"

import AutomationList from "@/components/automation/AutomationList"

export default function AutomationPage(){

return(

<div className="space-y-6">

{/* HEADER */}

<div className="flex items-center justify-between">

<div>
  <h1 className="text-xl font-semibold text-gray-900">
    Automation
  </h1>

  <p className="text-sm text-gray-500 mt-1">
    Create and manage your Instagram automations
  </p>
</div>

</div>

{/* LIST */}

<div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-6 shadow-sm hover:shadow-lg transition">
  <AutomationList/>
</div>

</div>

)
}