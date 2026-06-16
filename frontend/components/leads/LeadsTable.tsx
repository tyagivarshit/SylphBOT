"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { socket } from "@/lib/socket"
import StageBadge from "./StageBadge"
import IntelligencePanel from "./IntelligencePanel"
import { getLeadOpportunityIntelligence } from "@/lib/opportunityIntelligence"
import { Bot } from "lucide-react"

type Lead = {
  id: string
  name?: string | null
  platform?: string | null
  stage: string
  lastMessage?: string | null
  unreadCount?: number
  isHumanActive?: boolean
}

type LeadRealtimePatch = {
  lastMessage?: string | null
  unreadCount?: number
  stage?: string
  isHumanActive?: boolean
}

type NewMessagePayload = {
  leadId: string
  content: string
}

function getAssignedAIStatus(lead: Lead): "AI Managing" | "Founder Review Required" | "Human Override" | "Closing Soon" {
  if (lead.isHumanActive) return "Human Override";
  if (lead.stage === "READY_TO_BUY" || lead.stage === "WON") return "Closing Soon";
  if (lead.stage === "QUALIFIED" && lead.unreadCount && lead.unreadCount > 0) return "Founder Review Required";
  return "AI Managing";
}

function PlatformBadge({ platform }: { platform?: string | null }) {
  const plat = (platform || "Unknown").toLowerCase();
  let style = "bg-slate-50 text-slate-700 border-slate-200/60";
  if (plat.includes("instagram")) {
    style = "bg-pink-50 text-pink-700 border-pink-100";
  } else if (plat.includes("whatsapp")) {
    style = "bg-emerald-50 text-emerald-700 border-emerald-100";
  } else if (plat.includes("facebook") || plat.includes("messenger")) {
    style = "bg-blue-50 text-blue-700 border-blue-100";
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${style}`}>
      {platform || "Unknown"}
    </span>
  );
}

function MobileBottomSheet({ lead, onClose, onStageUpdate }: any) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(true);
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(onClose, 250);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div 
        onClick={handleClose}
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-250 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`} 
      />
      <div 
        className={`relative w-full max-h-[85vh] bg-white rounded-t-[30px] shadow-2xl flex flex-col transition-transform duration-300 transform ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto my-3 shrink-0" onClick={handleClose} />
        <div className="flex-1 overflow-y-auto pb-8">
          <IntelligencePanel lead={lead} onClose={handleClose} onStageUpdate={onStageUpdate} />
        </div>
      </div>
    </div>
  );
}

export default function LeadsTable({
  leads,
  initialSelectedLeadId,
}: {
  leads: Lead[];
  initialSelectedLeadId?: string | null;
}) {
  const router = useRouter()
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(
    initialSelectedLeadId ?? null
  )
  const [expandedWhyLeadId, setExpandedWhyLeadId] = useState<string | null>(null)
  const [livePatches, setLivePatches] = useState<Record<string, LeadRealtimePatch>>({})

  const tableLeads = useMemo(
    () =>
      leads.map((lead) => {
        const patch = livePatches[lead.id]

        return patch
          ? {
              ...lead,
              ...patch,
              unreadCount: patch.unreadCount ?? lead.unreadCount,
            }
          : lead
      }),
    [leads, livePatches]
  )

  const selectedLead = useMemo(() => {
    if (!selectedLeadId) return null
    return tableLeads.find((lead) => lead.id === selectedLeadId) ?? null
  }, [selectedLeadId, tableLeads])

  useEffect(() => {
    if (tableLeads.length > 0) {
      const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;
      const isSelectedLeadInList = tableLeads.some(l => l.id === selectedLeadId);
      
      if (isDesktop) {
        if (!isSelectedLeadInList) {
          const fallbackLead = tableLeads.find(l => l.id === initialSelectedLeadId) || tableLeads[0];
          setSelectedLeadId(fallbackLead.id);
        }
      } else {
        if (selectedLeadId && !isSelectedLeadInList) {
          setSelectedLeadId(null);
        }
      }
    } else {
      setSelectedLeadId(null);
    }
  }, [tableLeads, selectedLeadId, initialSelectedLeadId]);

  useEffect(() => {
    const handleNewMessage = (msg: NewMessagePayload) => {
      setLivePatches((prev) => {
        const existing = prev[msg.leadId]
        const fallbackLead = tableLeads.find((lead) => lead.id === msg.leadId)
        const previousUnread =
          existing?.unreadCount ?? fallbackLead?.unreadCount ?? 0

        return {
          ...prev,
          [msg.leadId]: {
            ...existing,
            lastMessage: msg.content,
            unreadCount: previousUnread + 1,
          },
        }
      })
    }

    socket.on("new_message", handleNewMessage)

    return () => {
      socket.off("new_message", handleNewMessage)
    }
  }, [tableLeads])

  const handleStageUpdate = (id: string, newStage: string) => {
    setLivePatches((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        stage: newStage,
      },
    }))
  }

  // Pre-calculate intelligence for all leads to avoid lag
  const opportunityData = useMemo(() => {
    const data: Record<string, ReturnType<typeof getLeadOpportunityIntelligence>> = {}
    tableLeads.forEach(lead => {
      data[lead.id] = getLeadOpportunityIntelligence(lead)
    })
    return data
  }, [tableLeads])

  return (
    <div className="relative">
      {tableLeads.length > 0 ? (
        <div className="flex flex-col lg:flex-row gap-6 items-stretch">
          {/* LEFT: Opportunity List (Persistent split layout) */}
          <div className="flex-1 min-w-0 transition-all duration-300">
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-2">
              {tableLeads.map((lead) => {
                const isSelected = lead.id === selectedLeadId
                const assignedStatus = getAssignedAIStatus(lead)
                let statusColor = "bg-sky-50 text-sky-700 border-sky-100"
                if (assignedStatus === "Human Override") {
                  statusColor = "bg-amber-50 text-amber-700 border-amber-100"
                } else if (assignedStatus === "Founder Review Required") {
                  statusColor = "bg-rose-50 text-rose-700 border-rose-100"
                } else if (assignedStatus === "Closing Soon") {
                  statusColor = "bg-emerald-50 text-emerald-700 border-emerald-100"
                }

                return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => setSelectedLeadId(lead.id)}
                    className={`relative w-full max-w-[360px] rounded-[24px] p-5 text-left transition-all duration-200 border bg-white/70 backdrop-blur-xl mx-auto md:mx-0 ${
                      isSelected
                        ? "border-blue-500 shadow-md ring-2 ring-blue-500/10 bg-blue-50/20"
                        : "border-slate-200/80 shadow-sm hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5"
                    }`}
                  >
                    {/* Unread dot */}
                    {lead.unreadCount ? (
                      <span className="absolute top-4 right-4 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                      </span>
                    ) : null}

                    {/* Header: Initial, Name, Stage, Platform in visual hierarchy */}
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,#0b2a5b_0%,#1e5eff_60%,#4da3ff_100%)] text-xs font-semibold text-white shadow-sm mt-0.5">
                        {lead.name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <p 
                          className="font-bold text-slate-900 text-sm leading-snug truncate sm:whitespace-normal sm:line-clamp-2" 
                          title={lead.name || "Opportunity"}
                        >
                          {lead.name || "New Opportunity"}
                        </p>
                        <div className="flex flex-col items-start gap-1">
                          <StageBadge stage={lead.stage} />
                          <div className="mt-0.5">
                            <PlatformBadge platform={lead.platform} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Assigned AI Status */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-semibold uppercase tracking-wider text-[9px]">Assigned Status</span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold border uppercase ${statusColor}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          assignedStatus === "AI Managing" ? "bg-sky-500" :
                          assignedStatus === "Human Override" ? "bg-amber-500" :
                          assignedStatus === "Founder Review Required" ? "bg-rose-500 animate-pulse" :
                          "bg-emerald-500"
                        }`} />
                        {assignedStatus}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* RIGHT: Persistent Intelligence Panel (Desktop Only) */}
          <div className="hidden lg:block lg:w-[400px] shrink-0 animate-in slide-in-from-right duration-250">
            <div className="sticky top-4 h-[calc(100vh-140px)]">
              {selectedLead ? (
                <IntelligencePanel
                  lead={selectedLead}
                  onClose={() => setSelectedLeadId(null)}
                  onStageUpdate={handleStageUpdate}
                />
              ) : (
                <div className="flex h-full flex-col justify-center items-center p-6 text-center rounded-[26px] bg-white/60 border border-slate-200/80 backdrop-blur-xl shadow-sm">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4 animate-pulse">
                    <Bot size={24} />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">
                    Opportunity Intelligence Command
                  </h3>
                  <p className="text-xs text-slate-400 max-w-[260px] leading-relaxed font-medium">
                    Select any opportunity from the list to reveal revenue insights, why it matters, and recommended actions.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* TABLET: Intelligence Panel below the list */}
          {selectedLead && (
            <div className="hidden md:block lg:hidden w-full border-t border-slate-200/60 pt-6 mt-4">
              <IntelligencePanel
                lead={selectedLead}
                onClose={() => setSelectedLeadId(null)}
                onStageUpdate={handleStageUpdate}
              />
            </div>
          )}

          {/* MOBILE: Bottom Sheet panel */}
          {selectedLead && (
            <div className="block md:hidden">
              <MobileBottomSheet
                lead={selectedLead}
                onClose={() => setSelectedLeadId(null)}
                onStageUpdate={handleStageUpdate}
              />
            </div>
          )}
        </div>
      ) : (
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
      )}
    </div>
  )
}
