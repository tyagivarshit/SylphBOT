"use client"

import CommentAutomationList from "@/components/commentAutomation/CommentAutomationList"

export default function CommentAutomationPage(){

return(

<div className="space-y-6 px-3 sm:px-5 lg:px-8 py-4 sm:py-6">

{/* HEADER */}

<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

<div>
  <h1 className="text-lg sm:text-xl font-semibold text-gray-900">
    Comment Automation
  </h1>

  <p className="text-xs sm:text-sm text-gray-500 mt-1">
    Automatically reply to comments and send DMs
  </p>
</div>

</div>

{/* LIST */}

<div className="bg-white border border-gray-200 rounded-2xl p-3 sm:p-4 lg:p-5 shadow-sm">
  <CommentAutomationList/>
</div>

</div>

)

}