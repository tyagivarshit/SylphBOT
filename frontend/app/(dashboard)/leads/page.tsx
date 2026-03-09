"use client"

import { useEffect, useState } from "react"
import { getRecentLeads } from "@/lib/dashboard"

import LeadsTable from "@/components/leads/LeadsTable"

export default function LeadsPage(){

  const [leads,setLeads] = useState<any[]>([])
  const [loading,setLoading] = useState(true)
  const [stage,setStage] = useState("")

  useEffect(()=>{

    const loadLeads = async()=>{

      try{

        const res = await getRecentLeads(undefined,stage)

        console.log("LEADS API:",res)

        setLeads(res?.data || res || [])

      }catch(err){

        console.error("Leads load error",err)

      }finally{

        setLoading(false)

      }

    }

    loadLeads()

  },[stage])

  if(loading){
    return <p className="text-gray-500">Loading leads...</p>
  }

  return(

    <div className="space-y-6">

      {/* Stage Filter */}
    <div className="flex justify-end">
      <select
      value={stage}
      onChange={(e)=>setStage(e.target.value)}
      className="border-2 border-gray-400 text-gray-900 bg-white rounded-lg px-3 py-2 text-sm font-medium shadow-sm hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">ALL</option>
        <option value="NEW">NEW</option>
        <option value="QUALIFIED">QUALIFIED</option>
        <option value="WON">WON</option>
        <option value="LOST">LOST</option>
        </select>
        </div>

      <LeadsTable leads={leads}/>

    </div>

  )

}