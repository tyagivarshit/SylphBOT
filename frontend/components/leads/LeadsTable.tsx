"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { socket } from "@/lib/socket"
import StageBadge from "./StageBadge"
import StageSelect from "./StageSelect"
import { getLeadDetail } from "@/lib/dashboard.api"
import { Bot, ShieldAlert, CheckCircle, MessageSquare } from "lucide-react"

type Lead = {
  id: string
  name?: string | null
  platform?: string | null
  stage: string
  lastMessage?: string | null
  unreadCount?: number
  isHumanActive?: boolean
  revenue?: string | null
  expectedCloseWindow?: string | null
  assignedAgentId?: string | null
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

const stageOptions = [
  { value: "NEW", label: "Initial Contact" },
  { value: "QUALIFIED", label: "Qualified Opportunity" },
  { value: "WON", label: "Deal Won" },
  { value: "LOST", label: "Deal Lost" },
]

const stageLabels: Record<string, string> = {
  NEW: "Initial Contact",
  QUALIFIED: "Qualified Opportunity",
  WON: "Deal Won",
  LOST: "Deal Lost"
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
  const [activeTab, setActiveTab] = useState<"Overview" | "AI Actions" | "Founder" | "Signals" | "Autonomy">("Overview")
  const [messages, setMessages] = useState<any[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)

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

  // Fetch real messages/logs for the selected lead
  useEffect(() => {
    const loadLeadDetails = async () => {
      if (!selectedLeadId) {
        setMessages([]);
        return;
      }
      try {
        setMessagesLoading(true);
        const res = await getLeadDetail(selectedLeadId);
        setMessages(res?.data?.messages || []);
      } catch (err) {
        console.error("Lead detail load error", err);
        setMessages([]);
      } finally {
        setMessagesLoading(false);
      }
    };
    loadLeadDetails();
  }, [selectedLeadId]);

  // Maintain active lead selection across list updates
  useEffect(() => {
    if (tableLeads.length > 0) {
      const isSelectedLeadInList = tableLeads.some(l => l.id === selectedLeadId);
      if (!isSelectedLeadInList) {
        const fallbackLead = tableLeads.find(l => l.id === initialSelectedLeadId) || tableLeads[0];
        setSelectedLeadId(fallbackLead.id);
      }
    } else {
      setSelectedLeadId(null);
    }
  }, [tableLeads, selectedLeadId, initialSelectedLeadId]);

  // Real-time unread/message updates via WebSockets
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
      });

      if (msg.leadId === selectedLeadId) {
        getLeadDetail(msg.leadId)
          .then((res) => {
            setMessages(res?.data?.messages || []);
          })
          .catch((err) => console.error(err));
      }
    }

    socket.on("new_message", handleNewMessage)

    return () => {
      socket.off("new_message", handleNewMessage)
    }
  }, [tableLeads, selectedLeadId])

  const handleStageUpdate = (id: string, newStage: string) => {
    setLivePatches((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        stage: newStage,
      },
    }))
  }

  // AI Actions Extraction
  const aiActions = useMemo(() => {
    return messages
      .filter((m) => m.sender !== "USER")
      .map((m) => {
        const text = m.content.toLowerCase();
        let eventName = "Initial outreach completed.";
        if (text.includes("price") || text.includes("pricing") || text.includes("cost") || text.includes("quote")) {
          eventName = "Proposal shared.";
        } else if (text.includes("demo") || text.includes("meeting") || text.includes("schedule")) {
          eventName = "Meeting booked.";
        } else if (text.includes("proposal") || text.includes("contract") || text.includes("agreement")) {
          eventName = "Proposal shared.";
        } else if (text.includes("follow up") || text.includes("checking in")) {
          eventName = "Follow-up sequence executed.";
        }
        return {
          time: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          date: new Date(m.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }),
          event: eventName
        };
      });
  }, [messages]);

  // Founder Decisions Required Extraction
  const founderActions = useMemo(() => {
    const actions: string[] = []
    if (selectedLead?.isHumanActive) {
      actions.push("Join strategic negotiation.")
    }
    const assignedStatus = selectedLead ? getAssignedAIStatus(selectedLead) : "AI Managing";
    if (assignedStatus === "Founder Review Required") {
      actions.push("Approve enterprise pricing.")
      actions.push("Review custom SLA request.")
    }
    return actions
  }, [selectedLead])

  // Buying Signals Intent Extraction
  const detectedSignals = useMemo(() => {
    const signals: string[] = [];
    messages.forEach((msg) => {
      const text = msg.content.toLowerCase();
      if (text.includes("price") || text.includes("cost") || text.includes("pricing") || text.includes("how much") || text.includes("quote")) {
        if (!signals.includes("Budget discussed.")) {
          signals.push("Budget discussed.");
        }
      }
      if (text.includes("team") || text.includes("manager") || text.includes("colleague") || text.includes("ceo") || text.includes("partner")) {
        if (!signals.includes("Multiple stakeholders involved.")) {
          signals.push("Multiple stakeholders involved.");
        }
      }
      if (text.includes("integrate") || text.includes("api") || text.includes("setup") || text.includes("developer") || text.includes("test")) {
        if (!signals.includes("Technical evaluation underway.")) {
          signals.push("Technical evaluation underway.");
        }
      }
    });
    return signals;
  }, [messages]);

  // Autonomy Status Assessment
  const autonomyAssessment = useMemo(() => {
    if (!selectedLead) return null;
    if (selectedLead.isHumanActive) {
      return {
        status: "Founder involvement is recommended due to enterprise complexity.",
        details: null
      };
    }
    if (messages.length > 0) {
      return {
        status: "Sales AI is managing this opportunity autonomously.",
        details: "No intervention has been required."
      };
    }
    return null;
  }, [selectedLead, messages]);

  const assignedStatusSelected = selectedLead ? getAssignedAIStatus(selectedLead) : "AI Managing";
  let statusColorSelected = "bg-sky-50 text-sky-700 border-sky-100";
  if (assignedStatusSelected === "Human Override") {
    statusColorSelected = "bg-amber-50 text-amber-700 border-amber-100";
  } else if (assignedStatusSelected === "Founder Review Required") {
    statusColorSelected = "bg-rose-50 text-rose-700 border-rose-100";
  } else if (assignedStatusSelected === "Closing Soon") {
    statusColorSelected = "bg-emerald-50 text-emerald-700 border-emerald-100";
  }

  return (
    <div className="relative space-y-6">
      {tableLeads.length > 0 ? (
        <div className="flex flex-col gap-6 max-w-2xl mx-auto">
          {/* Opportunity Feed */}
          <div className="space-y-3">
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
                  className={`relative w-full rounded-[24px] p-4 text-left transition-all duration-150 border bg-white/70 backdrop-blur-xl cursor-pointer ${
                    isSelected
                      ? "border-blue-500 shadow-md ring-2 ring-blue-500/10 bg-blue-50/20"
                      : "border-slate-200/80 shadow-sm hover:shadow-md hover:border-slate-300"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-slate-900 text-sm">{lead.name || "New Opportunity"}</span>
                      <StageBadge stage={lead.stage} />
                    </div>
                    <div className="flex items-center gap-2">
                      {lead.revenue ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                          ₹{lead.revenue}
                        </span>
                      ) : null}
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold border uppercase ${statusColor}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          assignedStatus === "AI Managing" ? "bg-sky-500" :
                          assignedStatus === "Human Override" ? "bg-amber-500" :
                          assignedStatus === "Founder Review Required" ? "bg-rose-500 animate-pulse" :
                          "bg-emerald-500"
                        }`} />
                        {assignedStatus === "AI Managing" ? "Sales AI Managing" : assignedStatus}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Selected Opportunity Workspace */}
          {selectedLead ? (
            <div className="border-t border-slate-200/80 pt-6 space-y-4 animate-in fade-in duration-200">
              {/* Opportunity Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{selectedLead.name || "New Opportunity"}</h3>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100/80 px-2.5 py-1 text-xs font-bold text-slate-700 whitespace-nowrap">
                      {stageLabels[selectedLead.stage] || selectedLead.stage}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold border uppercase ${statusColorSelected}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        assignedStatusSelected === "AI Managing" ? "bg-sky-500" :
                        assignedStatusSelected === "Human Override" ? "bg-amber-500" :
                        assignedStatusSelected === "Founder Review Required" ? "bg-rose-500 animate-pulse" :
                        "bg-emerald-500"
                      }`} />
                      {assignedStatusSelected === "AI Managing" ? "Sales AI Managing" : assignedStatusSelected}
                    </span>
                  </div>
                </div>
                <div className="sm:text-right">
                  <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">Opportunity Value</span>
                  <p className="text-sm font-bold text-slate-800 mt-1">
                    {selectedLead.revenue ? `₹${selectedLead.revenue} Opportunity` : "Opportunity value not yet established."}
                  </p>
                </div>
              </div>

              {/* Premium Tab system */}
              <div className="sticky top-[72px] z-10 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-[20px] p-1.5 flex gap-1 overflow-x-auto no-scrollbar shadow-sm my-4">
                {(["Overview", "AI Actions", "Founder", "Signals", "Autonomy"] as const).map((tab) => {
                  const isActive = activeTab === tab
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 min-w-[90px] text-center px-4 py-2 text-xs font-bold rounded-[14px] transition-all duration-150 whitespace-nowrap cursor-pointer ${
                        isActive
                          ? "bg-slate-900 text-white shadow-sm"
                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                      }`}
                    >
                      {tab}
                    </button>
                  )
                })}
              </div>

              {/* Tab Contents */}
              <div className="bg-slate-50/30 rounded-[24px] p-2 min-h-[200px]">
                {messagesLoading ? (
                  <div className="flex items-center justify-center py-12 text-xs font-semibold text-slate-400">
                    Loading intelligence...
                  </div>
                ) : (
                  <>
                    {activeTab === "Overview" && (
                      <div className="space-y-4">
                        <div className="rounded-[24px] border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
                          <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Revenue Snapshot</h4>
                          <div className="space-y-2.5 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Pipeline Stage:</span>
                              <span className="font-bold text-slate-800">
                                {stageLabels[selectedLead.stage] || selectedLead.stage}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Opportunity Value:</span>
                              <span className="font-bold text-slate-800">
                                {selectedLead.revenue ? `₹${selectedLead.revenue}` : "Not established"}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Assigned AI Worker:</span>
                              <span className="font-bold text-slate-800">
                                {selectedLead.assignedAgentId || "Sales AI"}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Ownership State:</span>
                              <span className="font-bold text-slate-800">
                                {selectedLead.isHumanActive ? "Human Override" : "AI Managed"}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        {!selectedLead.revenue && (
                          <p className="text-[11px] font-semibold text-slate-400 text-center leading-relaxed">
                            Additional opportunity intelligence will appear as engagement progresses.
                          </p>
                        )}
                      </div>
                    )}

                    {activeTab === "AI Actions" && (
                      <div className="space-y-4">
                        {aiActions.length > 0 ? (
                          <div className="space-y-3">
                            <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Execution Logs</h4>
                            <div className="relative pl-5 border-l border-slate-200 ml-2 space-y-4">
                              {aiActions.map((action, idx) => (
                                <div key={idx} className="relative">
                                  <span className="absolute -left-[25px] top-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 border border-white ring-4 ring-white" />
                                  <span className="text-[9px] font-bold text-slate-400 block">{action.date} at {action.time}</span>
                                  <span className="text-xs font-semibold text-slate-700 mt-0.5 block">{action.event}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/45 p-6 text-center text-slate-500">
                            <p className="text-xs font-semibold leading-relaxed">
                              No automated actions have been executed yet.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === "Founder" && (
                      <div className="space-y-4">
                        {founderActions.length > 0 ? (
                          <div className="rounded-2xl border border-amber-100 bg-amber-50/25 p-5 space-y-3">
                            <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Required Decisions</h4>
                            <div className="space-y-2">
                              {founderActions.map((action, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                  {action}
                                </div>
                              ))}
                            </div>
                            
                            <button
                              onClick={() => router.push(`/conversations?leadId=${selectedLead.id}`)}
                              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition cursor-pointer"
                            >
                              <MessageSquare size={13} />
                              Open Conversation Thread
                            </button>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-slate-150 bg-white p-5 text-center text-slate-500 space-y-2">
                            <p className="text-xs font-bold text-slate-800">No founder action required.</p>
                            <p className="text-[11px] text-slate-400">Sales AI can continue autonomously.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === "Signals" && (
                      <div className="space-y-4">
                        {detectedSignals.length > 0 ? (
                          <div className="space-y-2.5">
                            <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Buying Signals</h4>
                            <div className="space-y-2">
                              {detectedSignals.map((sig, idx) => (
                                <div key={idx} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  {sig}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/45 p-6 text-center text-slate-500">
                            <p className="text-xs font-semibold leading-relaxed">
                              No meaningful buying signals detected yet.
                            </p>
                            <p className="text-[11px] text-slate-400 mt-1 font-medium">
                              Sales AI continues monitoring engagement patterns.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === "Autonomy" && (
                      <div className="space-y-4">
                        {autonomyAssessment ? (
                          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-700 space-y-2.5 shadow-sm">
                            <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Autonomy Status</h4>
                            <div className="flex items-center gap-2 font-semibold">
                              <span className={`h-1.5 w-1.5 rounded-full ${selectedLead.isHumanActive ? "bg-amber-500" : "bg-emerald-500"}`} />
                              {autonomyAssessment.status}
                            </div>
                            {autonomyAssessment.details && (
                              <div className="flex items-center gap-2 font-medium text-slate-500 pl-3.5">
                                {autonomyAssessment.details}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/45 p-6 text-center text-slate-500">
                            <p className="text-xs font-semibold leading-relaxed">
                              Autonomy assessment will become available as engagement history develops.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Stage Controls */}
              <div className="border-t border-slate-200/80 pt-6 mt-6 shrink-0">
                <label className="text-xs font-bold text-slate-700 block mb-2">
                  Update Opportunity Stage
                </label>
                <StageSelect
                  value={selectedLead.stage}
                  options={stageOptions}
                  direction="up"
                  ariaLabel="Update opportunity stage"
                  className="w-full"
                  onChange={(newStage) => handleStageUpdate(selectedLead.id, newStage)}
                />
              </div>
            </div>
          ) : null}
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
