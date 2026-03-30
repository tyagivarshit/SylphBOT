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

  <p className="text-sm text-gray-600 mt-1">
    Create and manage your Instagram automations
  </p>
</div>

</div>

{/* LIST */}

<div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition">
  <AutomationList/>
</div>

</div>

)
}