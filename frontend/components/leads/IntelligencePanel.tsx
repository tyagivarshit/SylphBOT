"use client"

import { useEffect, useRef, useState } from "react"
import { X, Percent, BadgeDollarSign, Bot, ShieldAlert, Lightbulb, Activity, MessageSquare, ChevronRight, Sparkles } from "lucide-react"
import { getLeadDetail } from "@/lib/dashboard.api"
import { apiFetch } from "@/lib/apiClient"
import { socket } from "@/lib/socket"
import StageSelect from "./StageSelect"
import StageBadge from "./StageBadge"
import { getLeadOpportunityIntelligence } from "@/lib/opportunityIntelligence"
import { useRouter } from "next/navigation"

const stageOptions = [
  { value: "NEW", label: "Initial Contact" },
  { value: "QUALIFIED", label: "Qualified Lead" },
  { value: "WON", label: "Deal Won" },
  { value: "LOST", label: "Deal Lost" },
]

export default function IntelligencePanel({ lead, onClose, onStageUpdate }: any) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<"intel" | "chat">("intel")
  const [messages, setMessages] = useState<any[]>([])
  const [stage, setStage] = useState(lead?.stage)
  const [typing, setTyping] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [whyExpanded, setWhyExpanded] = useState(true)

  // Collapse by default on mobile screen widths
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setWhyExpanded(false)
    }
  }, [])

  const bottomRef = useRef<HTMLDivElement>(null)

  // Get intelligence details for this lead
  const intel = getLeadOpportunityIntelligence(lead)

  /* AUTO SCROLL FOR CHAT */
  useEffect(() => {
    if (activeTab === "chat") {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, activeTab])

  /* LOAD LEAD MESSAGES */
  useEffect(() => {
    const loadLead = async () => {
      try {
        const res = await getLeadDetail(lead.id)
        setMessages(res?.data?.messages || [])
      } catch (err) {
        console.error("Lead detail load error", err)
      }
    }

    if (lead?.id) {
      loadLead()
      setStage(lead.stage)
      setActionMessage(null)
    }
  }, [lead])

  /* SOCKET FOR CHAT */
  useEffect(() => {
    if (!lead?.id) return

    socket.emit("join_conversation", lead.id)

    const handleNewMsg = (msg: any) => {
      if (msg.leadId === lead.id) {
        setMessages((prev) => [...prev, msg])
      }
    }

    const handleTyping = (leadId: string) => {
      if (leadId === lead.id) setTyping(true)
    }

    const handleStopTyping = (leadId: string) => {
      if (leadId === lead.id) setTyping(false)
    }

    socket.on("new_message", handleNewMsg)
    socket.on("typing", handleTyping)
    socket.on("stop_typing", handleStopTyping)

    return () => {
      socket.off("new_message", handleNewMsg)
      socket.off("typing", handleTyping)
      socket.off("stop_typing", handleStopTyping)
    }
  }, [lead])

  /* UPDATE STAGE */
  const updateStage = async (newStage: string) => {
    try {
      setStage(newStage)
      await apiFetch(`/api/dashboard/leads/${lead.id}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ stage: newStage }),
        headers: { "Content-Type": "application/json" }
      })
      onStageUpdate?.(lead.id, newStage)
    } catch (err) {
      console.error("Stage update error", err)
    }
  }

  const handleActionClick = (actionLabel: string) => {
    setActionMessage(`Action logged: "${actionLabel}" for ${lead.name || "Lead"}`)
    setTimeout(() => {
      setActionMessage(null)
    }, 4000)
  }

  let lastDate = ""

  return (
    <div className="flex h-full flex-col rounded-[26px] bg-white/90 border border-slate-200/80 shadow-lg overflow-hidden backdrop-blur-xl">
      {/* PANEL HEADER */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#0b2a5b_0%,#1e5eff_60%,#4da3ff_100%)] text-sm font-semibold text-white shadow-md">
            {lead?.name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-950 truncate max-w-[180px]">
              {lead?.name || "Opportunity Details"}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                {lead?.platform || "Unknown"}
              </span>
              <span className="text-[11px] text-slate-300">•</span>
              <StageBadge stage={stage} />
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition duration-150"
          aria-label="Close intelligence panel"
        >
          <X size={16} />
        </button>
      </div>

      {/* TABS SELECTOR */}
      <div className="flex border-b border-slate-100 p-2 gap-1 bg-white">
        <button
          onClick={() => setActiveTab("intel")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-xl transition-all duration-150 ${
            activeTab === "intel"
              ? "bg-blue-50 text-blue-700 shadow-sm"
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          }`}
        >
          <Bot size={14} />
          Opportunity Intel
        </button>
        <button
          onClick={() => setActiveTab("chat")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-xl transition-all duration-150 ${
            activeTab === "chat"
              ? "bg-blue-50 text-blue-700 shadow-sm"
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          }`}
        >
          <MessageSquare size={14} />
          Live Conversation
          {messages.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[9px] rounded-full bg-blue-600 text-white font-bold">
              {messages.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB CONTENT */}
      <div className="flex-1 overflow-y-auto bg-slate-50/30">
        {activeTab === "intel" ? (
          <div className="p-5 space-y-6">
            {/* OVERVIEW METRICS */}
            <div className="grid grid-cols-2 gap-4">
              {/* Close Probability */}
              <div className="bg-white p-4 rounded-[20px] border border-slate-100 shadow-sm space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                  <Percent size={14} className="text-blue-500" />
                  Close Probability
                  <span 
                    title="Calculated using pipeline stage and interaction velocity." 
                    className="cursor-help text-slate-300 font-bold hover:text-blue-500 transition text-[9px]"
                  >
                    ⓘ
                  </span>
                </div>
                <div className="text-xl font-bold text-slate-900">
                  {intel.closeProbability}%
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-600 to-cyan-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${intel.closeProbability}%` }}
                  />
                </div>
              </div>

              {/* Revenue Potential */}
              <div className="bg-white p-4 rounded-[20px] border border-slate-100 shadow-sm space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                  <BadgeDollarSign size={14} className="text-emerald-500" />
                  Estimated Opportunity
                  <span 
                    title="Calculated using current opportunity signals." 
                    className="cursor-help text-slate-300 font-bold hover:text-blue-500 transition text-[9px]"
                  >
                    ⓘ
                  </span>
                </div>
                <div className="text-xl font-bold text-emerald-700">
                  ₹{intel.revenuePotential.toLocaleString("en-IN")}
                </div>
                <div className="text-[10px] text-slate-400 font-medium capitalize flex items-center gap-1">
                  Intent: <span className="font-bold text-slate-600">{intel.intentAnalysis}</span>
                  <span 
                    title="Identified based on positive keyword sentiments and activity touchpoints." 
                    className="cursor-help text-slate-300 font-bold hover:text-blue-500 transition text-[9px]"
                  >
                    ⓘ
                  </span>
                </div>
              </div>
            </div>

            {/* AI SUMMARY */}
            <div className="bg-gradient-to-br from-blue-50/50 to-indigo-50/20 p-4 rounded-[20px] border border-blue-100/60 shadow-sm space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-800">
                <Bot size={16} />
                Sales AI Worker Summary
              </div>
              <p className="text-xs leading-relaxed text-slate-700 font-medium italic">
                "{intel.aiSummary}"
              </p>
              <div className="flex items-center justify-between pt-2 border-t border-blue-100/40 text-[10px] text-slate-400 font-medium">
                <span>Worker: {intel.assignedAIWorker}</span>
                <span className="bg-blue-100/60 text-blue-800 px-2 py-0.5 rounded-full font-semibold">Active</span>
              </div>
            </div>

            {/* WHY THIS OPPORTUNITY MATTERS */}
            <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setWhyExpanded(!whyExpanded)}
                className="w-full flex items-center justify-between p-4 text-xs font-bold text-slate-900 border-b border-slate-55 hover:bg-slate-50/50 transition duration-150"
              >
                <div className="flex items-center gap-1.5">
                  <Sparkles size={14} className="text-blue-500 animate-pulse" />
                  <span>Why This Opportunity Matters</span>
                </div>
                <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">
                  {whyExpanded ? "Collapse ▲" : "Expand ▾"}
                </span>
              </button>

              {whyExpanded && (
                <div className="p-4 bg-slate-50/10 space-y-2.5 animate-in slide-in-from-top duration-200">
                  {intel.whySignals?.map((signal, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 font-medium">
                      <span className="text-emerald-500 font-bold shrink-0">✓</span>
                      <span>{signal}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* RECOMMENDED ACTIONS */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <Lightbulb size={14} className="text-amber-500 animate-pulse" />
                Recommended Next Actions
              </div>

              {actionMessage && (
                <div className="text-xs p-2.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 font-medium transition duration-200">
                  {actionMessage}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {intel.recommendedNextActions.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleActionClick(action.label)}
                    className="brand-button-secondary bg-white hover:bg-slate-50/80 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-800 border border-slate-200 transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>

            {/* OBJECTIONS */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <ShieldAlert size={14} className="text-rose-500" />
                Primary Objections (AI Flagged)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {intel.primaryObjections.map((obj, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-rose-50/60 text-rose-700 border border-rose-100/50"
                  >
                    {obj}
                  </span>
                ))}
              </div>
            </div>

            {/* CONVERSATION SHORTCUT */}
            <div className="bg-white p-4 rounded-[20px] border border-slate-100 shadow-sm space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <MessageSquare size={14} className="text-slate-500" />
                Recent Conversation Summary
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-medium bg-slate-50 p-3 rounded-xl border border-slate-100">
                {intel.recentConversationSummary}
              </p>
              <button
                onClick={() => router.push(`/conversations?leadId=${lead.id}`)}
                className="w-full flex items-center justify-between py-2.5 px-4 text-xs font-semibold text-white bg-[linear-gradient(135deg,#0b2a5b_0%,#1e5eff_100%)] rounded-xl hover:opacity-95 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5"
              >
                <span>Go to Inbox Conversation</span>
                <ChevronRight size={14} />
              </button>
            </div>

            {/* ACTIVITY TIMELINE */}
            <div className="space-y-3 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <Activity size={14} className="text-blue-500" />
                Activity Timeline
              </div>
              <div className="relative pl-6 border-l border-slate-200 ml-2 space-y-4 pt-1">
                {intel.activityTimeline.map((item, idx) => (
                  <div key={idx} className="relative">
                    <span className="absolute -left-[29px] top-1.5 h-2 w-2 rounded-full bg-blue-500 border border-white ring-4 ring-white" />
                    <span className="text-[10px] font-bold text-slate-400 block">{item.time}</span>
                    <span className="text-xs font-semibold text-slate-700 mt-0.5 block">{item.event}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* CHAT CONTENT */
          <div className="flex flex-col h-full bg-slate-50/20">
            {/* CHAT MESSAGES STREAM */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px]">
              {messages.length > 0 ? (
                messages.map((msg: any) => {
                  const isUser = msg.sender === "USER"
                  const date = new Date(msg.createdAt).toDateString()
                  const showDate = date !== lastDate
                  lastDate = date

                  return (
                    <div key={msg.id} className="space-y-1">
                      {showDate && (
                        <div className="text-center text-[10px] font-bold text-slate-400 my-2">
                          {date}
                        </div>
                      )}
                      <div className={`flex ${isUser ? "" : "justify-end"}`}>
                        <div
                          className={`px-3.5 py-2 rounded-2xl text-xs max-w-[80%] break-words shadow-sm ${
                            isUser
                              ? "bg-white border border-slate-100 text-slate-950 font-medium"
                              : "bg-[linear-gradient(135deg,#0b2a5b_0%,#1e5eff_100%)] text-white font-medium"
                          }`}
                        >
                          {msg.content}
                          <div
                            className={`text-[9px] mt-1 ${
                              isUser ? "text-slate-400" : "text-white/70 text-right"
                            }`}
                          >
                            {new Date(msg.createdAt).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center text-xs text-slate-400 py-12">
                  No conversation thread found.
                </div>
              )}

              {typing && (
                <div className="text-[10px] text-slate-400 font-semibold italic animate-pulse">
                  AI worker typing...
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* STAGE CONTROLS */}
            <div className="border-t border-slate-200/60 p-4 bg-white space-y-2">
              <label className="text-xs font-bold text-slate-800 block">
                Update Opportunity Stage
              </label>
              <StageSelect
                value={stage}
                options={stageOptions}
                direction="up"
                ariaLabel="Update opportunity stage"
                className="w-full"
                onChange={updateStage}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
