"use client"

import { useEffect, useState } from "react"
import { getRecentLeads } from "@/lib/dashboard"

import LeadsTable from "@/components/leads/LeadsTable"
import FeatureGate from "@/components/FeatureGate"
import { usePlan } from "@/hooks/usePlan"

export default function LeadsPage(){

  const { plan } = usePlan()

  const [leads,setLeads] = useState<any[]>([])
  const [loading,setLoading] = useState(true)
  const [stage,setStage] = useState("")

  const isAllowed = plan !== "BASIC" // ✅ IMPORTANT

  useEffect(()=>{

    const loadLeads = async()=>{

      try{

        // ❌ BASIC → API call skip
        if(!isAllowed){
          setLoading(false)
          return
        }

        const res = await getRecentLeads(undefined,stage)

        setLeads(res?.data || res || [])

      }catch(err){

        console.error("Leads load error",err)

      }finally{

        setLoading(false)

      }

    }

    loadLeads()

  },[stage, isAllowed])

  return(

    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex items-center justify-between">

        <h1 className="text-xl font-semibold text-gray-900">
          Leads CRM
        </h1>

        <select
          value={stage}
          onChange={(e)=>setStage(e.target.value)}
          className="border-2 border-gray-300 text-gray-900 bg-white rounded-lg px-3 py-2 text-sm font-medium shadow-sm hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">ALL</option>
          <option value="NEW">NEW</option>
          <option value="QUALIFIED">QUALIFIED</option>
          <option value="WON">WON</option>
          <option value="LOST">LOST</option>
        </select>

      </div>

      {/* CONTENT */}

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-gray-500">
          Loading leads...
        </div>
      ) : (

        <FeatureGate feature="CRM">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">

            {/* 👇 BASIC user ke liye fake preview */}
            {!isAllowed ? (
              <p className="text-sm text-gray-500 text-center py-10">
                Preview of your leads will appear here 🚀
              </p>
            ) : leads.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-10">
                No leads yet. Start automations to capture leads 🚀
              </p>
            ) : (
              <LeadsTable leads={leads}/>
            )}

          </div>
        </FeatureGate>

      )}

    </div>

  )

}