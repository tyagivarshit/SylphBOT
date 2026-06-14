"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { usePlan } from "@/hooks/usePlan"
import { useSearchParams } from "next/navigation"
import { apiFetch } from "@/lib/apiClient"
import { recordLifecycleEvent } from "@/lib/lifecycleTelemetry"
import { getDashboardStats } from "@/lib/dashboard.api"
import { getLeadOpportunityIntelligence } from "@/lib/opportunityIntelligence"
import StatCard from "@/components/cards/StatCard"
import { Flame, AlertCircle, TrendingUp } from "lucide-react"

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
  id: string;
  name?: string | null;
  platform?: string | null;
  stage: string;
  lastMessage?: string | null;
  unreadCount?: number;
}

function LeadsPageContent(){
  const searchParams = useSearchParams()

  const { plan } = usePlan()

  const [leads,setLeads] = useState<LeadItem[]>([])
  const [loading,setLoading] = useState(true)
  const [stage,setStage] = useState("")
  const [page,setPage] = useState(1)
  const [totalPages,setTotalPages] = useState(1)
  const [stats,setStats] = useState<any>(null)
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

  useEffect(() => {
    if (!isAllowed) return;
    getDashboardStats()
      .then((res) => {
        if (res.success && res.data) {
          setStats(res.data);
        }
      })
      .catch((err) => console.error("Stats load error", err));
  }, [isAllowed]);

  const overviewMetrics = useMemo(() => {
    const intelLeads = leads.map(l => ({
      ...l,
      intel: getLeadOpportunityIntelligence(l)
    }))

    const hotList = intelLeads.filter(l => l.stage === "QUALIFIED" || l.intel.closeProbability >= 75)
    const attentionList = intelLeads.filter(l => l.stage === "NEW" || (l.unreadCount && l.unreadCount > 0))
    const activeList = intelLeads.filter(l => l.stage === "NEW" || l.stage === "QUALIFIED")

    const hotRev = hotList.reduce((acc, curr) => acc + curr.intel.revenuePotential, 0)
    const attentionRev = attentionList.reduce((acc, curr) => acc + curr.intel.revenuePotential, 0)
    const activeRev = activeList.reduce((acc, curr) => acc + curr.intel.revenuePotential, 0)

    const totalLeadsStat = stats?.totalLeads || leads.length
    const qualifiedLeadsStat = stats?.qualifiedLeads || hotList.length

    return {
      hotCount: qualifiedLeadsStat,
      hotRevenue: hotRev || (qualifiedLeadsStat * 75000),
      attentionCount: Math.max(0, totalLeadsStat - qualifiedLeadsStat),
      attentionRevenue: attentionRev || (Math.max(0, totalLeadsStat - qualifiedLeadsStat) * 30000),
      activeCount: totalLeadsStat,
      activeRevenue: activeRev || (totalLeadsStat * 45000),
    }
  }, [leads, stats])

  return(

    <div className="min-w-0 space-y-5">

      {/* CONTENT */}
      {loading ? (
        <div className="brand-panel rounded-[26px] p-6 text-slate-500">
          Loading Lead OS...
        </div>
      ) : (

        <FeatureGate feature="CRM">

          {/* SECTION 1: Lead OS Overview */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              title="Hot Leads"
              value={overviewMetrics.hotCount}
              icon={<Flame size={20} className="text-orange-600" />}
              trend={`₹${overviewMetrics.hotRevenue.toLocaleString('en-IN')} Est. Opportunity`}
            />
            <StatCard
              title="Needs Attention"
              value={overviewMetrics.attentionCount}
              icon={<AlertCircle size={20} className="text-amber-600" />}
              trend={`₹${overviewMetrics.attentionRevenue.toLocaleString('en-IN')} Est. Opportunity`}
            />
            <StatCard
              title="Active Opportunities"
              value={overviewMetrics.activeCount}
              icon={<TrendingUp size={20} className="text-emerald-600" />}
              trend={`₹${overviewMetrics.activeRevenue.toLocaleString('en-IN')} Est. Opportunity`}
            />
          </div>

          <div className="brand-section-shell rounded-[30px] p-4 sm:p-5 lg:p-6">
            <div className="mb-5 flex flex-col gap-4 border-b border-slate-200/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <span className="brand-chip w-fit">Pipeline visibility</span>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                    Opportunity Intelligence Workspace
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                    Understand where revenue opportunities exist, why they matter, and what action should happen next.
                  </p>
                </div>
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
              <p className="brand-empty-state rounded-[24px] py-10 text-center text-sm">
                No active opportunities yet. Capture new leads to begin.
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
        Loading Lead OS...
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

