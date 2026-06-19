"use client"

import { useEffect, useState } from "react"
import WorkforceView from "./WorkforceView"
import ClientScopeSelector from "@/components/clients/ClientScopeSelector"
import { getClients } from "@/lib/clients"

export default function TrainingTabs(){

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

<div className="space-y-6">

  <ClientScopeSelector
    clients={clients}
    value={selectedClientId}
    onChange={setSelectedClientId}
    label="Training & Operational Scope"
    helperText="Manage and train the global AI workforce, or select a client to configure custom instructions and knowledge base sources for that client closer."
  />

  <div className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white/80 shadow-sm p-4 sm:p-6">
    <WorkforceView clientId={selectedClientId} />
  </div>

</div>

)

}
