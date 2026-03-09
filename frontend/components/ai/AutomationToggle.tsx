"use client"

import { useState } from "react"
import { Bot, Send } from "lucide-react"

export default function AutomationToggle() {

const [autoReply, setAutoReply] = useState(true)
const [followup, setFollowup] = useState(true)

const Toggle = ({value,onToggle}:any)=>(
<button
role="switch"
aria-checked={value}
onClick={onToggle}
className={`relative w-11 h-6 rounded-full transition ${
value ? "bg-blue-600" : "bg-gray-300"
}`}
>

<span
className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition ${
value ? "translate-x-5" : ""
}`}
></span>

</button>
)

return(

<div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm space-y-6">

{/* Header */}

<div>

<h3 className="text-base sm:text-lg font-semibold text-gray-900">
Automation
</h3>

<p className="text-sm text-gray-500">
Control how AI automation responds to your leads
</p>

</div>


{/* Auto Reply */}

<div className="flex items-center justify-between gap-4">

<div className="flex items-start gap-3 min-w-0">

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

<Toggle
value={autoReply}
onToggle={()=>setAutoReply(!autoReply)}
/>

</div>


{/* Follow-up */}

<div className="flex items-center justify-between gap-4">

<div className="flex items-start gap-3 min-w-0">

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

<Toggle
value={followup}
onToggle={()=>setFollowup(!followup)}
/>

</div>

</div>

)

}