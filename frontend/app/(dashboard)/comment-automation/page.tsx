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

<div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-4 sm:p-5 lg:p-6 shadow-sm hover:shadow-lg transition">
  <CommentAutomationList/>
</div>

</div>

)
}