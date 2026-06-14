"use client"

import { useEffect, useMemo, useState } from "react"
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
}

type LeadRealtimePatch = {
  lastMessage?: string | null
  unreadCount?: number
  stage?: string
}

type NewMessagePayload = {
  leadId: string
  content: string
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
          {/* LEFT: Opportunity List */}
          <div className={`w-full transition-all duration-300 ${selectedLead ? "lg:w-3/5" : "lg:w-full"}`}>
            <div className={`grid gap-4 ${
              selectedLead 
                ? "grid-cols-1" 
                : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
            }`}>
              {tableLeads.map((lead) => {
                const intel = opportunityData[lead.id] || getLeadOpportunityIntelligence(lead)
                const isSelected = lead.id === selectedLeadId
                const isWhyExpanded = lead.id === expandedWhyLeadId

                return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => setSelectedLeadId(isSelected ? null : lead.id)}
                    className={`relative w-full rounded-[24px] p-5 text-left transition-all duration-200 border bg-white/70 backdrop-blur-xl ${
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

                    {/* Header: Initial, Name, Platform, Stage */}
                    <div className="flex items-start gap-3 justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,#0b2a5b_0%,#1e5eff_60%,#4da3ff_100%)] text-xs font-semibold text-white shadow-sm">
                          {lead.name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-bold text-slate-900 text-sm">
                            {lead.name || "Lead Opportunity"}
                          </p>
                          <div className="mt-0.5">
                            <PlatformBadge platform={lead.platform} />
                          </div>
                        </div>
                      </div>
                      <StageBadge stage={lead.stage} />
                    </div>

                    {/* Middle: Probability & Revenue */}
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                      <div>
                        <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[9px]">
                          Close Probability
                        </span>
                        <span className="text-slate-900 font-bold text-sm">
                          {intel.closeProbability}%
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[9px]">
                          Revenue Opportunity
                        </span>
                        <span className="text-emerald-700 font-bold text-sm">
                          ₹{intel.revenuePotential.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    {/* Footer: Sales AI Recommendation */}
                    <div className="mt-3.5 bg-blue-50/50 rounded-xl p-2.5 border border-blue-100/40 flex items-start gap-1.5">
                      <Bot size={14} className="text-blue-600 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold text-blue-800 uppercase tracking-wider block">
                            Sales AI Recommendation
                          </span>
                          {/* Why CTA Toggle (hidden on mobile) */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation(); // prevent selecting the card
                              setExpandedWhyLeadId(isWhyExpanded ? null : lead.id);
                            }}
                            className="text-[10px] font-bold text-blue-600 hover:text-blue-800 underline px-1.5 py-0.5 rounded hover:bg-blue-100/40 transition hidden sm:inline-block"
                          >
                            {isWhyExpanded ? "Hide Why ▲" : "Why? ▾"}
                          </button>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5 line-clamp-1 italic font-medium">
                          "{intel.aiRecommendation}"
                        </p>
                      </div>
                    </div>

                    {/* Inline WHY signals accordion (tablet & desktop only) */}
                    {isWhyExpanded && (
                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600 hidden sm:block animate-in slide-in-from-top duration-200">
                        <span className="font-bold text-slate-700 block uppercase tracking-wider text-[9px] mb-1">
                          Why this matters:
                        </span>
                        {intel.whySignals?.map((signal, idx) => (
                          <div key={idx} className="flex items-start gap-1.5 font-medium">
                            <span className="text-emerald-500 font-bold">✓</span>
                            <span>{signal}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* RIGHT: Intelligence Panel (Desktop) */}
          {selectedLead && (
            <div className="hidden lg:block lg:w-2/5 shrink-0 min-w-[380px] max-w-[460px] animate-in slide-in-from-right duration-250">
              <div className="sticky top-4 h-[calc(100vh-140px)]">
                <IntelligencePanel
                  lead={selectedLead}
                  onClose={() => setSelectedLeadId(null)}
                  onStageUpdate={handleStageUpdate}
                />
              </div>
            </div>
          )}

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
        <div className="brand-empty-state rounded-[24px] px-6 py-12 text-center text-sm">
          No opportunities found. Capture new leads to populate.
        </div>
      )}
    </div>
  )
}
