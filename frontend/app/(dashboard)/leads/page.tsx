"use client"

import { Suspense, useEffect, useState } from "react"
import { usePlan } from "@/hooks/usePlan"
import axios from "axios"
import { useSearchParams } from "next/navigation"
import { buildApiUrl } from "@/lib/url"

import LeadsTable from "@/components/leads/LeadsTable"
import StageSelect from "@/components/leads/StageSelect"
import FeatureGate from "@/components/FeatureGate"
import PageHeader from "@/components/brand/PageHeader"

const stageOptions = [
  { value: "", label: "All Stages" },
  { value: "NEW", label: "New" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
]

type LeadItem = {
  id: string
  name?: string | null
  platform?: string | null
  stage: string
  lastMessage?: string | null
  unreadCount?: number
}

function LeadsPageContent(){
  const searchParams = useSearchParams()

  const { plan } = usePlan()

  const [leads,setLeads] = useState<LeadItem[]>([])
  const [loading,setLoading] = useState(true)
  const [stage,setStage] = useState("")
  const [page,setPage] = useState(1)
  const [totalPages,setTotalPages] = useState(1)
  const initialSelectedLeadId = searchParams.get("leadId")

  const isAllowed =
    plan !== "FREE_LOCKED" && plan !== "BASIC"

  useEffect(()=>{

    const loadLeads = async()=>{

      try{

        if(!isAllowed){
          setLoading(false)
          return
        }

        const res = await axios.get(buildApiUrl("/dashboard/leads"), {
          withCredentials: true,
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

      <PageHeader
        eyebrow="CRM"
        title="Leads CRM"
        description="Track captured conversations, monitor stages, and open full lead context inside the same premium Automexia product experience."
        chip={<span className="brand-chip">Pipeline visibility</span>}
        action={
          <StageSelect
            value={stage}
            options={stageOptions}
            ariaLabel="Filter leads by stage"
            className="w-full sm:w-[220px]"
            onChange={(value)=>{
              setStage(value)
              setPage(1)
            }}
          />
        }
      />

      {/* CONTENT */}
      {loading ? (
        <div className="brand-panel rounded-[26px] p-6 text-slate-500">
          Loading leads...
        </div>
      ) : (

        <FeatureGate feature="CRM">

          <div className="brand-panel rounded-[28px] p-5 md:p-6">

            {!isAllowed ? (
              <p className="brand-empty-state rounded-[24px] py-10 text-center text-sm">
                Preview of your leads will appear here 🚀
              </p>
            ) : leads.length === 0 ? (
              <p className="brand-empty-state rounded-[24px] py-10 text-center text-sm">
                No leads yet. Start automations to capture leads 🚀
              </p>
            ) : (
              <>
                <LeadsTable
                  leads={leads}
                  initialSelectedLeadId={initialSelectedLeadId}
                />

                {/* PAGINATION */}
                <div className="mt-5 flex items-center justify-between gap-3">

                  <button
                    disabled={page === 1}
                    onClick={()=>setPage((p)=>p-1)}
                    className="brand-button-secondary px-4 py-2 text-sm disabled:opacity-50"
                  >
                    Prev
                  </button>

                  <span className="text-sm text-slate-500">
                    Page {page} of {totalPages}
                  </span>

                  <button
                    disabled={page === totalPages}
                    onClick={()=>setPage((p)=>p+1)}
                    className="brand-button-secondary px-4 py-2 text-sm disabled:opacity-50"
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

function LeadsPageFallback() {
  return (
    <div className="min-w-0 space-y-6">
      <div className="brand-panel rounded-[26px] p-6 text-slate-500">
        Loading leads...
      </div>
    </div>
  )
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<LeadsPageFallback />}>
      <LeadsPageContent />
    </Suspense>
  )
}

