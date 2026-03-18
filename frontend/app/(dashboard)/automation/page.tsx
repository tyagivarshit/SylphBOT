"use client"

import AutomationList from "@/components/automation/AutomationList"

export default function AutomationPage(){

return(

<div className="space-y-6">

  {/* HEADER */}
  <div>

    <h1 className="text-lg font-semibold text-gray-900">
      Automation
    </h1>

    <p className="text-sm text-gray-500 mt-1">
      Create and manage your Instagram automations
    </p>

  </div>

  {/* 🔽 LIST (button wapas yahi handle karega) */}
  <AutomationList/>

</div>

)

}