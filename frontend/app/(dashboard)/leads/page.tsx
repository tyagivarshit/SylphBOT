"use client"

import { useEffect, useState } from "react"
import { getRecentLeads } from "@/lib/dashboard"

import LeadsTable from "@/components/leads/LeadsTable"
import LeadsFilters from "@/components/leads/LeadsFilters"

export default function LeadsPage(){

  const [leads,setLeads] = useState<any[]>([])
  const [loading,setLoading] = useState(true)

  useEffect(()=>{

    const loadLeads = async()=>{

      try{

        const data = await getRecentLeads()

        // FIX
        setLeads(data || [])

      }catch(err){

        console.error("Leads load error",err)

      }finally{

        setLoading(false)

      }

    }

    loadLeads()

  },[])

  if(loading){
    return <p className="text-gray-500">Loading leads...</p>
  }

  return(

    <div className="space-y-6">

      <LeadsFilters/>

      <LeadsTable leads={leads}/>

    </div>

  )

}