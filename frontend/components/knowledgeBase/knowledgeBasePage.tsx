"use client"

import { useEffect, useState } from "react"
import KnowledgeList from "./KnowledgeList"
import ClientScopeSelector from "@/components/clients/ClientScopeSelector"
import { getClients } from "@/lib/clients"

export default function KnowledgeBasePage(){
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

    <div className="min-w-0 space-y-4 sm:space-y-6">

      <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-4 sm:p-5 shadow-sm">
        <h1 className="text-lg sm:text-xl font-semibold text-gray-900">
          Knowledge Base
        </h1>

        <p className="text-xs sm:text-sm text-gray-500 mt-1">
          Manage and organize client-specific and shared AI sales knowledge
        </p>
      </div>

      <ClientScopeSelector
        clients={clients}
        value={selectedClientId}
        onChange={setSelectedClientId}
        label="Knowledge Scope"
        helperText="Shared Business Brain is used as fallback knowledge. Select a client to manage only that client’s sales knowledge."
      />

      <KnowledgeList clientId={selectedClientId}/>

    </div>

  )

}
