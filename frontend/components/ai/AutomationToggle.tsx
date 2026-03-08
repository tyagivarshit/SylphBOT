"use client"

import { useState } from "react"
import { Bot, Send } from "lucide-react"

export default function AutomationToggle() {

const [autoReply, setAutoReply] = useState(true)
const [followup, setFollowup] = useState(true)

return(

<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-6">

{/* Header */}

<div>

<h3 className="text-lg font-semibold text-gray-900">
Automation
</h3>

<p className="text-sm text-gray-500">
Control how AI automation responds to your leads
</p>

</div>


{/* Auto Reply */}

<div className="flex items-center justify-between">

<div className="flex items-start gap-3">

<Bot size={18} className="text-blue-600 mt-0.5"/>

<div>

<p className="text-sm font-medium text-gray-900">
Auto Reply
</p>

<p className="text-xs text-gray-500">
Automatically reply to incoming messages
</p>

</div>

</div>

<button
onClick={()=>setAutoReply(!autoReply)}
className={`relative w-11 h-6 rounded-full transition
${autoReply ? "bg-blue-600" : "bg-gray-300"}
`}
>

<span
className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition
${autoReply ? "translate-x-5" : ""}
`}
></span>

</button>

</div>


{/* Follow-up */}

<div className="flex items-center justify-between">

<div className="flex items-start gap-3">

<Send size={18} className="text-blue-600 mt-0.5"/>

<div>

<p className="text-sm font-medium text-gray-900">
Follow-up Messages
</p>

<p className="text-xs text-gray-500">
Send automatic follow-ups to inactive leads
</p>

</div>

</div>

<button
onClick={()=>setFollowup(!followup)}
className={`relative w-11 h-6 rounded-full transition
${followup ? "bg-blue-600" : "bg-gray-300"}
`}
>

<span
className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition
${followup ? "translate-x-5" : ""}
`}
></span>

</button>

</div>

</div>

)

}