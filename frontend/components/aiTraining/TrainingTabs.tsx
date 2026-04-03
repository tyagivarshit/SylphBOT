"use client"

import { useState } from "react"
import BusinessInfoForm from "./BusinessInfoForm"
import FAQForm from "./FAQForm"
import AISettingsForm from "./AISettingsForm"

export default function TrainingTabs(){

const [tab,setTab] = useState("business")

return(

<div className="bg-white/70 backdrop-blur-xl border border-blue-100 rounded-2xl shadow-sm">

{/* 🔥 TABS */}

<div className="flex border-b border-blue-100 px-2">

<button
onClick={()=>setTab("business")}
className={`px-4 py-3 text-sm rounded-xl transition ${
tab==="business"
? "bg-gradient-to-r from-blue-600/10 to-cyan-500/10 text-blue-700 font-semibold"
: "text-gray-600 hover:bg-blue-50"
}`}
>
Business Info
</button>

<button
onClick={()=>setTab("faq")}
className={`px-4 py-3 text-sm rounded-xl transition ${
tab==="faq"
? "bg-gradient-to-r from-blue-600/10 to-cyan-500/10 text-blue-700 font-semibold"
: "text-gray-600 hover:bg-blue-50"
}`}
>
FAQs
</button>

<button
onClick={()=>setTab("settings")}
className={`px-4 py-3 text-sm rounded-xl transition ${
tab==="settings"
? "bg-gradient-to-r from-blue-600/10 to-cyan-500/10 text-blue-700 font-semibold"
: "text-gray-600 hover:bg-blue-50"
}`}
>
AI Settings
</button>

</div>

{/* 🔥 CONTENT */}

<div className="p-6">

{tab==="business" && <BusinessInfoForm/>}
{tab==="faq" && <FAQForm/>}
{tab==="settings" && <AISettingsForm/>}

</div>

</div>

)

}