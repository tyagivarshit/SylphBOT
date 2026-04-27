"use client"

import { Suspense, useEffect, useState } from "react"
import { usePlan } from "@/hooks/usePlan"
import { useSearchParams } from "next/navigation"
import { apiFetch } from "@/lib/apiClient"

import LeadsTable from "@/components/leads/LeadsTable"
import StageSelect from "@/components/leads/StageSelect"
import FeatureGate from "@/components/FeatureGate"
import { hasFeature } from "@/lib/featureGuard"

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

  const isAllowed = hasFeature(plan, "CRM")

  useEffect(()=>{

    const loadLeads = async()=>{

      try{

        if(!isAllowed){
          setLoading(false)
          return
        }

        const params = new URLSearchParams({
          page: String(page),
          limit: "10",
        });

        if (stage) {
          params.set("stage", stage);
        }

        const response = await apiFetch<{
          leads?: LeadItem[];
          pagination?: {
            totalPages?: number;
          };
        }>(`/api/dashboard/leads?${params.toString()}`, {
          credentials: "include",
        });

        if (!response.success || !response.data) {
          throw new Error(response.message || "Failed to load leads");
        }

        setLeads(response.data.leads || [])
        setTotalPages(response.data.pagination?.totalPages || 1)

      }catch(err){
        console.error("Leads load error",err)
      }finally{
        setLoading(false)
      }

    }

    loadLeads()

  },[stage,page,isAllowed])

  return(

    <div className="min-w-0 space-y-5">

      {/* CONTENT */}
      {loading ? (
        <div className="brand-panel rounded-[26px] p-6 text-slate-500">
          Loading leads...
        </div>
      ) : (

        <FeatureGate feature="CRM">

          <div className="brand-section-shell rounded-[30px] p-4 sm:p-5 lg:p-6">
            <div className="mb-5 flex flex-col gap-4 border-b border-slate-200/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <span className="brand-chip w-fit">Pipeline visibility</span>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                    Lead pipeline
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                    Filter stages, review unread activity, and open lead context
                    from one clean CRM surface.
                  </p>
                </div>
              </div>

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
            </div>

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

