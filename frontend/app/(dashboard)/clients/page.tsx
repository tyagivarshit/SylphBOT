"use client"

import { useEffect,useState } from "react"
import { getClients } from "@/lib/clients"

import ClientCard from "@/components/clients/ClientCard"
import AddClientModal from "@/components/clients/AddClientModal"

export default function ClientsPage(){

  const [clients,setClients] = useState<any[]>([])
  const [open,setOpen] = useState(false)

  useEffect(()=>{

    const loadClients = async()=>{

      const data = await getClients()

      setClients(data)

    }

    loadClients()

  },[])

  return(

    <div className="space-y-6">

      <div className="flex justify-between items-center">

        <h1 className="text-xl font-semibold">
          Connected Platforms
        </h1>

        <button
          onClick={()=>setOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          Add Platform
        </button>

      </div>

      <div className="grid grid-cols-3 gap-6">

        {clients.map((client)=>(
          <ClientCard
            key={client.id}
            client={client}
          />
        ))}

      </div>

      {open && (
        <AddClientModal onClose={()=>setOpen(false)}/>
      )}

    </div>

  )

}