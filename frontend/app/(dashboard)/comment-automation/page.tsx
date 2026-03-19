"use client"

import CommentAutomationList from "@/components/commentAutomation/CommentAutomationList"

export default function CommentAutomationPage(){

return(

<div className="space-y-6">

{/* HEADER */}

<div className="flex items-center justify-between">

<div>
  <h1 className="text-lg font-semibold text-gray-900">
    Comment Automation
  </h1>

  <p className="text-sm text-gray-500 mt-1">
    Automatically reply to comments and send DMs
  </p>
</div>

</div>

{/* LIST */}

<div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
  <CommentAutomationList/>
</div>

</div>

)

}