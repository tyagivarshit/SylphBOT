"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import LeadDrawer from "./LeadDrawer"
import StageBadge from "./StageBadge"
import { socket } from "@/lib/socket"

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

  return (
    <div className="relative">
      {tableLeads.length > 0 ? (
        <>
          <div className="space-y-3 md:hidden">
            {tableLeads.map((lead) => {
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
                  className="brand-panel block w-full rounded-[24px] p-4 text-left shadow-sm transition hover:-translate-y-0.5 bg-white border border-slate-200"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#0b2a5b_0%,#1e5eff_60%,#4da3ff_100%)] text-sm font-semibold text-white shadow-[0_14px_30px_rgba(30,94,255,0.2)]">
                        {lead.name?.charAt(0)?.toUpperCase() || "?"}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-950">
                          {lead.name || `Lead ${lead.id.slice(-4)}`}
                        </p>
                        <p className="truncate text-xs text-slate-400 mt-0.5">
                          ID: {lead.id}
                        </p>
                      </div>
                    </div>

                    <StageBadge stage={lead.stage} />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-650 border border-slate-200">
                        {lead.platform || "Unknown"}
                      </span>

                      {lead.unreadCount ? (
                        <span className="rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-bold text-white uppercase tracking-wider">
                          {lead.unreadCount} new
                        </span>
                      ) : null}
                    </div>

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

          <div className="brand-table-wrap hidden overflow-hidden rounded-[26px] md:block">
            <div className="overflow-x-auto">
              <table className="brand-table min-w-full text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200/80">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">
                      Lead
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">
                      Platform
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">
                      Stage
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">
                      Assigned AI Status
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white/70">
                  {tableLeads.map((lead) => {
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
                      <tr
                        key={lead.id}
                        className="cursor-pointer transition-all duration-150 hover:bg-slate-50/50"
                        onClick={() => setSelectedLeadId(lead.id)}
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-[linear-gradient(135deg,#0b2a5b_0%,#1e5eff_60%,#4da3ff_100%)] text-xs font-semibold text-white shadow-[0_14px_30px_rgba(30,94,255,0.18)]">
                              {lead.name?.charAt(0)?.toUpperCase() || "?"}
                            </div>

                            <div className="min-w-0">
                              <span className="block truncate font-semibold text-slate-950">
                                {lead.name || `Lead ${lead.id.slice(-4)}`}
                              </span>
                              <span className="truncate text-xs text-slate-400">
                                ID: {lead.id}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold capitalize text-slate-700">
                            {lead.platform || "Unknown"}
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          <StageBadge stage={lead.stage} />
                        </td>

                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold border uppercase ${statusColor}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              assignedStatus === "AI Managing" ? "bg-sky-500" :
                              assignedStatus === "Human Override" ? "bg-amber-500" :
                              assignedStatus === "Founder Review Required" ? "bg-rose-500 animate-pulse" :
                              "bg-emerald-500"
                            }`} />
                            {assignedStatus}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="brand-empty-state rounded-[24px] px-6 py-12 text-center text-sm bg-slate-50">
          No leads yet. Start automations to capture new conversations.
        </div>
      )}

      {selectedLead?.id ? (
        <LeadDrawer
          lead={selectedLead}
          onClose={() => setSelectedLeadId(null)}
          onStageUpdate={handleStageUpdate}
        />
      ) : null}
    </div>
  )
}
