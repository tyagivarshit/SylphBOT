"use client"

import { useState } from "react"
import BusinessInfoForm from "./BusinessInfoForm"
import FAQForm from "./FAQForm"
import AISettingsForm from "./AISettingsForm"

export default function TrainingTabs(){

const [tab,setTab] = useState("business")

return(

<div className="bg-white border border-gray-200 rounded-xl">

{/* TABS */}

<div className="flex border-b">

<button
onClick={()=>setTab("business")}
className={`px-4 py-3 text-sm ${
tab==="business"
? "border-b-2 border-blue-600 text-blue-600 font-medium"
: "text-gray-600"
}`}
>
Business Info
</button>

<button
onClick={()=>setTab("faq")}
className={`px-4 py-3 text-sm ${
tab==="faq"
? "border-b-2 border-blue-600 text-blue-600 font-medium"
: "text-gray-600"
}`}
>
FAQs
</button>

<button
onClick={()=>setTab("settings")}
className={`px-4 py-3 text-sm ${
tab==="settings"
? "border-b-2 border-blue-600 text-blue-600 font-medium"
: "text-gray-600"
}`}
>
AI Settings
</button>

</div>

{/* CONTENT */}

<div className="p-6">

{tab==="business" && <BusinessInfoForm/>}
{tab==="faq" && <FAQForm/>}
{tab==="settings" && <AISettingsForm/>}

</div>

</div>

)

}