"use client"

import AutomationList from "@/components/automation/AutomationList"

export default function AutomationPage(){

return(

<div className="space-y-6">

{/* HEADER */}

<div className="flex items-center justify-between">

<div>
  <h1 className="text-lg font-semibold text-gray-900">
    Automation
  </h1>

  <p className="text-sm text-gray-500 mt-1">
    Create and manage your Instagram automations
  </p>
</div>

{/* FUTURE: stats / toggle */}

</div>

{/* LIST */}

<div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
  <AutomationList/>
</div>

</div>

)

}