"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { usePlan } from "@/hooks/usePlan"
import { useRouter, useSearchParams } from "next/navigation"
import { apiFetch } from "@/lib/apiClient"
import { recordLifecycleEvent } from "@/lib/lifecycleTelemetry"
import { Bot } from "lucide-react"

import LeadsTable from "@/components/leads/LeadsTable"
import StageSelect from "@/components/leads/StageSelect"
import FeatureGate from "@/components/FeatureGate"
import { hasFeature } from "@/lib/featureGuard"

const stageOptions = [
  { value: "", label: "All Opportunities" },
  { value: "NEW", label: "Initial Contact" },
  { value: "QUALIFIED", label: "Qualified Opportunity" },
  { value: "WON", label: "Deal Won" },
  { value: "LOST", label: "Deal Lost" },
]

type LeadItem = {
  id: string;
  name?: string | null;
  platform?: string | null;
  stage: string;
  lastMessage?: string | null;
  unreadCount?: number;
}

function LeadsPageContent(){
  const router = useRouter()
  const searchParams = useSearchParams()

  const { plan } = usePlan()

  const [leads,setLeads] = useState<LeadItem[]>([])
  const [loading,setLoading] = useState(true)
  const [stage,setStage] = useState("")
  const [page,setPage] = useState(1)
  const [totalPages,setTotalPages] = useState(1)
  const initialSelectedLeadId = searchParams.get("leadId")
  const leadsRequestSequenceRef = useRef(0)

  const isAllowed = hasFeature(plan, "CRM")

  useEffect(()=>{

    const loadLeads = async()=>{
      const requestSequence = ++leadsRequestSequenceRef.current

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

        if (requestSequence !== leadsRequestSequenceRef.current) {
          recordLifecycleEvent("stale_response_ignored", {
            area: "leads_list",
            requestSequence,
          })
          return
        }

        setLeads(response.data.leads || [])
        setTotalPages(response.data.pagination?.totalPages || 1)

      }catch(err){
        if (requestSequence !== leadsRequestSequenceRef.current) {
          recordLifecycleEvent("stale_response_ignored", {
            area: "leads_list_error",
            requestSequence,
          })
          return
        }
        console.error("Leads load error",err)
      }finally{
        if (requestSequence === leadsRequestSequenceRef.current) {
          setLoading(false)
        }
      }

    }

    loadLeads()

  },[stage,page,isAllowed])



  return(

    <div className="min-w-0 space-y-5">

      {/* CONTENT */}
      {loading ? (
        <div className="brand-panel rounded-[26px] p-6 text-slate-500">
          Loading Opportunity Feed...
        </div>
      ) : (

        <FeatureGate feature="CRM">

          <div className="brand-section-shell rounded-[30px] p-4 sm:p-5 lg:p-6">
            <div className="mb-5 flex flex-col gap-4 border-b border-slate-200/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-bold tracking-tight text-slate-900 uppercase">
                  Opportunity Feed
                </h2>
              </div>

              <StageSelect
                value={stage}
                options={stageOptions}
                ariaLabel="Filter opportunities by stage"
                className="w-full sm:w-[220px]"
                onChange={(value)=>{
                  setStage(value)
                  setPage(1)
                }}
              />
            </div>

            {!isAllowed ? (
              <p className="brand-empty-state rounded-[24px] py-10 text-center text-sm">
                Preview of your Lead OS V2 will appear here 🚀
              </p>
            ) : leads.length === 0 ? (
              <div className="brand-panel rounded-[30px] p-8 text-center max-w-lg mx-auto space-y-4 my-6">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 mx-auto">
                  <Bot size={22} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-slate-900">No active opportunities yet</h3>
                  <div className="text-xs text-slate-500 leading-relaxed space-y-2 font-medium">
                    <p>Once conversations begin, Automexia will identify:</p>
                    <ul className="text-left inline-block space-y-1 pl-4 list-disc">
                      <li>Hot opportunities</li>
                      <li>Revenue signals</li>
                      <li>Opportunities needing attention</li>
                      <li>Sales AI recommendations</li>
                    </ul>
                    <p className="mt-2 text-slate-400">Capture new opportunities to begin.</p>
                  </div>
                </div>
                <div className="pt-2">
                  <button
                    onClick={() => router.push("/conversations")}
                    className="brand-button-secondary inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition shadow-sm hover:shadow active:scale-[0.98]"
                  >
                    <span>Open Conversations</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
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
        Loading Opportunity Feed...
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

