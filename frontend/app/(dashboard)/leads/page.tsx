"use client"

import { useEffect, useState } from "react"
import { usePlan } from "@/hooks/usePlan"
import axios from "axios"
import { useSearchParams } from "next/navigation"

import LeadsTable from "@/components/leads/LeadsTable"
import StageSelect from "@/components/leads/StageSelect"
import FeatureGate from "@/components/FeatureGate"

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
  withCredentials: true,
})

const stageOptions = [
  { value: "", label: "All Stages" },
  { value: "NEW", label: "New" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
]

export default function LeadsPage(){
  const searchParams = useSearchParams()

  const { plan } = usePlan()

  const [leads,setLeads] = useState<any[]>([])
  const [loading,setLoading] = useState(true)
  const [stage,setStage] = useState("")
  const [page,setPage] = useState(1)
  const [totalPages,setTotalPages] = useState(1)
  const initialSelectedLeadId = searchParams.get("leadId")

  const isAllowed = plan !== "BASIC"

  useEffect(()=>{

    const loadLeads = async()=>{

      try{

        if(!isAllowed){
          setLoading(false)
          return
        }

        const res = await api.get("/api/dashboard/leads",{
          params:{
            page,
            limit:10,
            stage: stage || undefined
          }
        })

        setLeads(res.data.data.leads || [])
        setTotalPages(res.data.data.pagination?.totalPages || 1)

      }catch(err){
        console.error("Leads load error",err)
      }finally{
        setLoading(false)
      }

    }

    loadLeads()

  },[stage,page,isAllowed])

  return(

    <div className="min-w-0 space-y-6">

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

        <h1 className="text-xl font-semibold text-gray-900">
          Leads CRM
        </h1>

        <StageSelect
          value={stage}
          options={stageOptions}
          ariaLabel="Filter leads by stage"
          className="w-full sm:w-[180px]"
          onChange={(value)=>{
            setStage(value)
            setPage(1)
          }}
        />

      </div>

      {/* CONTENT */}
      {loading ? (
        <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-6 text-gray-500 shadow-sm">
          Loading leads...
        </div>
      ) : (

        <FeatureGate feature="CRM">

          <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 md:p-6 shadow-sm">

            {!isAllowed ? (
              <p className="text-sm text-gray-500 text-center py-10">
                Preview of your leads will appear here 🚀
              </p>
            ) : leads.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-10">
                No leads yet. Start automations to capture leads 🚀
              </p>
            ) : (
              <>
                <LeadsTable
                  leads={leads}
                  initialSelectedLeadId={initialSelectedLeadId}
                />

                {/* PAGINATION */}
                <div className="flex justify-between items-center mt-5">

                  <button
                    disabled={page === 1}
                    onClick={()=>setPage((p)=>p-1)}
                    className="px-4 py-2 text-sm font-medium bg-blue-50 text-gray-700 rounded-xl hover:shadow-sm transition disabled:opacity-50"
                  >
                    Prev
                  </button>

                  <span className="text-sm text-gray-500">
                    Page {page} of {totalPages}
                  </span>

                  <button
                    disabled={page === totalPages}
                    onClick={()=>setPage((p)=>p+1)}
                    className="px-4 py-2 text-sm font-medium bg-blue-50 text-gray-700 rounded-xl hover:shadow-sm transition disabled:opacity-50"
                  >
                    Next
                  </button>

                </div>
              </>
            )}

          </div>

        </FeatureGate>

      )}

    </div>

  )

}
