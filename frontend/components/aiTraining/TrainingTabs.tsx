"use client"

import { useEffect, useState } from "react"
import BusinessInfoForm from "./BusinessInfoForm"
import FAQForm from "./FAQForm"
import AISettingsForm from "./AISettingsForm"
import ClientScopeSelector from "@/components/clients/ClientScopeSelector"
import { getClients } from "@/lib/clients"

export default function TrainingTabs(){

const [tab,setTab] = useState("business")
const [selectedClientId,setSelectedClientId] = useState("")
const [clients,setClients] = useState<any[]>([])

useEffect(() => {
  const loadClients = async () => {
    try {
      const data = await getClients()
      setClients((data || []).filter((client: any) => client.platform !== "SYSTEM"))
    } catch (error) {
      console.error("Client load error:", error)
      setClients([])
    }
  }

  loadClients()
}, [])

return(

<div className="space-y-4">

<ClientScopeSelector
clients={clients}
value={selectedClientId}
onChange={setSelectedClientId}
label="Client Sales Brain"
helperText="Use Shared Business Brain for reusable fallback knowledge, or choose a connected client to train a separate closer for that client."
/>

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

{tab==="business" && <BusinessInfoForm clientId={selectedClientId}/>}
{tab==="faq" && <FAQForm clientId={selectedClientId}/>}
{tab==="settings" && <AISettingsForm clientId={selectedClientId}/>}

</div>

</div>

</div>

)

}
