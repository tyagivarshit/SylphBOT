"use client"

import { useState } from "react"
import BusinessInfoForm from "./BusinessInfoForm"
import FAQForm from "./FAQForm"
import AISettingsForm from "./AISettingsForm"

export default function TrainingTabs(){

const [tab,setTab] = useState("business")

return(

<div className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white/80 shadow-sm">

{/* 🔥 TABS */}

<div className="flex flex-wrap gap-2 border-b border-slate-200/80 bg-slate-50/70 px-3 py-3">

<button
onClick={()=>setTab("business")}
className={`rounded-2xl px-4 py-2.5 text-sm transition ${
tab==="business"
? "bg-white text-slate-950 shadow-sm font-semibold"
: "text-slate-600 hover:bg-white/80"
}`}
>
Business Info
</button>

<button
onClick={()=>setTab("faq")}
className={`rounded-2xl px-4 py-2.5 text-sm transition ${
tab==="faq"
? "bg-white text-slate-950 shadow-sm font-semibold"
: "text-slate-600 hover:bg-white/80"
}`}
>
FAQs
</button>

<button
onClick={()=>setTab("settings")}
className={`rounded-2xl px-4 py-2.5 text-sm transition ${
tab==="settings"
? "bg-white text-slate-950 shadow-sm font-semibold"
: "text-slate-600 hover:bg-white/80"
}`}
>
AI Settings
</button>

</div>

{/* 🔥 CONTENT */}

<div className="p-4 sm:p-6">

{tab==="business" && <BusinessInfoForm/>}
{tab==="faq" && <FAQForm/>}
{tab==="settings" && <AISettingsForm/>}

</div>

</div>

)

}
