"use client";

import { useEffect, useState } from "react";
import { X, Bot, ShieldAlert, Sparkles, MessageSquare, AlertTriangle, CheckCircle, Activity, Lightbulb } from "lucide-react";
import { getLeadDetail } from "@/lib/dashboard.api";
import { apiFetch } from "@/lib/apiClient";
import StageSelect from "./StageSelect";
import StageBadge from "./StageBadge";
import { useRouter } from "next/navigation";

const stageOptions = [
  { value: "NEW", label: "Initial Contact" },
  { value: "QUALIFIED", label: "Qualified Opportunity" },
  { value: "WON", label: "Deal Won" },
  { value: "LOST", label: "Deal Lost" },
];

interface Message {
  id: string;
  sender: string;
  content: string;
  createdAt: string;
}

interface Lead {
  id: string;
  name?: string | null;
  platform?: string | null;
  stage: string;
  unreadCount?: number;
  isHumanActive?: boolean;
  revenue?: string | null;
  expectedCloseWindow?: string | null;
  assignedAgentId?: string | null;
}

function getAssignedAIStatus(lead: Lead): "AI Managing" | "Founder Review Required" | "Human Override" | "Closing Soon" {
  if (lead.isHumanActive) return "Human Override";
  if (lead.stage === "READY_TO_BUY" || lead.stage === "WON") return "Closing Soon";
  if (lead.stage === "QUALIFIED" && lead.unreadCount && lead.unreadCount > 0) return "Founder Review Required";
  return "AI Managing";
}

export default function IntelligencePanel({ lead, onClose, onStageUpdate }: { lead: Lead; onClose: () => void; onStageUpdate?: (id: string, stage: string) => void }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"Overview" | "AI Actions" | "Founder" | "Signals" | "Autonomy">("Overview");
  const [messages, setMessages] = useState<Message[]>([]);
  const [stage, setStage] = useState(lead?.stage);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadLead = async () => {
      try {
        setLoading(true);
        const res = await getLeadDetail(lead.id);
        setMessages(res?.data?.messages || []);
      } catch (err) {
        console.error("Lead detail load error", err);
      } finally {
        setLoading(false);
      }
    };

    if (lead?.id) {
      loadLead();
      setStage(lead.stage);
    }
  }, [lead]);

  const updateStage = async (newStage: string) => {
    try {
      setStage(newStage);
      await apiFetch(`/api/dashboard/leads/${lead.id}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ stage: newStage }),
        headers: { "Content-Type": "application/json" }
      });
      onStageUpdate?.(lead.id, newStage);
    } catch (err) {
      console.error("Stage update error", err);
    }
  };

  // Compute status
  const assignedStatus = getAssignedAIStatus(lead);
  let statusColor = "bg-sky-50 text-sky-700 border-sky-100";
  if (assignedStatus === "Human Override") {
    statusColor = "bg-amber-50 text-amber-700 border-amber-100";
  } else if (assignedStatus === "Founder Review Required") {
    statusColor = "bg-rose-50 text-rose-700 border-rose-100";
  } else if (assignedStatus === "Closing Soon") {
    statusColor = "bg-emerald-50 text-emerald-700 border-emerald-100";
  }

  // Detect real signals from messages
  const detectSignals = () => {
    const signals: string[] = [];
    messages.forEach((msg) => {
      const text = msg.content.toLowerCase();
      if (text.includes("price") || text.includes("cost") || text.includes("pricing") || text.includes("how much") || text.includes("quote")) {
        if (!signals.includes("Budget confirmed.")) {
          signals.push("Budget confirmed.");
        }
      }
      if (text.includes("demo") || text.includes("meeting") || text.includes("call") || text.includes("schedule")) {
        if (!signals.includes("Meeting requested.")) {
          signals.push("Meeting requested.");
        }
      }
      if (text.includes("integrate") || text.includes("api") || text.includes("setup") || text.includes("developer")) {
        if (!signals.includes("Technical stakeholders involved.")) {
          signals.push("Technical stakeholders involved.");
        }
      }
      if (text.includes("proposal") || text.includes("contract") || text.includes("terms")) {
        if (!signals.includes("Proposal reviewed.")) {
          signals.push("Proposal reviewed.");
        }
      }
    });
    return signals;
  };

  const detectedSignals = detectSignals();

  // Extract AI outbound actions
  const aiActions = messages
    .filter((m) => m.sender !== "USER")
    .map((m) => {
      const text = m.content.toLowerCase();
      let eventName = "Initial outreach sent.";
      if (text.includes("price") || text.includes("pricing") || text.includes("cost") || text.includes("quote")) {
        eventName = "Pricing information provided.";
      } else if (text.includes("demo") || text.includes("meeting") || text.includes("schedule")) {
        eventName = "Meeting scheduled.";
      } else if (text.includes("proposal") || text.includes("contract") || text.includes("agreement")) {
        eventName = "Proposal shared.";
      } else if (text.includes("follow up") || text.includes("checking in")) {
        eventName = "Follow-up delivered.";
      }
      return {
        time: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date(m.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        event: eventName
      };
    });

  return (
    <div className="flex h-full flex-col rounded-[26px] bg-white border border-slate-200 shadow-lg overflow-hidden">
      {/* 5. Selected Opportunity Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-snug truncate">
              {lead?.name || "New Opportunity"}
            </h2>
            <p className="text-xs font-semibold text-slate-500 mt-1">
              {lead?.revenue ? `₹${lead.revenue} Opportunity` : "Opportunity value not yet established."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StageBadge stage={stage} />
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
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-655 hover:bg-slate-100 transition shrink-0 lg:hidden"
          aria-label="Close panel"
        >
          <X size={16} />
        </button>
      </div>

      {/* 6. Horizontally Scrollable Tab System */}
      <div
        className="flex overflow-x-auto border-b border-slate-150 p-2 gap-1 bg-white scrollbar-none shrink-0"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {(["Overview", "AI Actions", "Founder", "Signals", "Autonomy"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 px-4 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === tab
                ? "bg-blue-50 text-blue-700 shadow-sm"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* TAB CONTENT (Only active content renders) */}
      <div className="flex-1 overflow-y-auto p-5 bg-slate-50/20">
        {activeTab === "Overview" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-150 bg-white p-4.5 space-y-3 shadow-sm">
              <h4 className="text-xs uppercase font-bold text-slate-400 tracking-wider">Revenue Snapshot</h4>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Pipeline Stage:</span>
                  <span className="font-bold text-slate-850">{stageOptions.find((o) => o.value === stage)?.label || stage}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Opportunity Value:</span>
                  <span className="font-bold text-slate-850">{lead?.revenue ? `₹${lead.revenue}` : "Not established"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Expected Close:</span>
                  <span className="font-bold text-slate-850">{lead?.expectedCloseWindow || "Not established"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Assigned AI Agent:</span>
                  <span className="font-bold text-slate-850">{lead?.assignedAgentId || "Sales AI"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ownership State:</span>
                  <span className="font-bold text-slate-850">{lead?.isHumanActive ? "Human Override" : "AI Managed"}</span>
                </div>
              </div>
            </div>
            
            <p className="text-[11px] font-semibold text-slate-400 text-center leading-relaxed">
              Additional opportunity intelligence will appear as customer engagement increases.
            </p>
          </div>
        )}

        {activeTab === "AI Actions" && (
          <div className="space-y-4">
            {aiActions.length > 0 ? (
              <div className="space-y-3">
                <h4 className="text-xs uppercase font-bold text-slate-400 tracking-wider">Execution Logs</h4>
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
            {assignedStatus === "Founder Review Required" || lead.isHumanActive ? (
              <div className="rounded-2xl border border-amber-100 bg-amber-50/25 p-4.5 space-y-3">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-855">Review / Intervention Required</h4>
                    <p className="text-[11px] text-slate-655 mt-1 leading-relaxed">
                      {lead.isHumanActive 
                        ? "Respond to escalation."
                        : "Review contract request."
                      }
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={() => router.push(`/conversations?leadId=${lead.id}`)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition"
                >
                  <MessageSquare size={13} />
                  Open Conversation Thread
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-150 bg-white p-4.5 text-center text-slate-600 space-y-2">
                <div className="flex justify-center">
                  <CheckCircle size={20} className="text-emerald-500" />
                </div>
                <p className="text-xs font-bold text-slate-800">No founder action required.</p>
                <p className="text-[11px] text-slate-500">Sales AI can continue autonomously.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "Signals" && (
          <div className="space-y-4">
            {detectedSignals.length > 0 ? (
              <div className="space-y-2.5">
                <h4 className="text-xs uppercase font-bold text-slate-400 tracking-wider">Buying Signals detected</h4>
                <div className="space-y-2">
                  {detectedSignals.map((sig, idx) => (
                    <div key={idx} className="flex items-center gap-2 rounded-xl border border-slate-150 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
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
            {lead.isHumanActive ? (
              <div className="rounded-2xl border border-slate-150 bg-white p-4.5 text-xs text-slate-600 space-y-2">
                <p className="font-bold text-slate-850">Autonomy Status</p>
                <p className="font-medium text-slate-500">Founder review is recommended due to enterprise complexity.</p>
              </div>
            ) : messages.length > 0 ? (
              <div className="rounded-2xl border border-slate-150 bg-white p-4.5 text-xs text-slate-655 space-y-2.5">
                <p className="font-bold text-slate-855">Autonomy Status</p>
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  AI currently managing this opportunity independently.
                </div>
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Human intervention has not been required.
                </div>
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
      </div>

      {/* Stage Controls */}
      <div className="border-t border-slate-150 p-4 bg-white shrink-0">
        <label className="text-xs font-bold text-slate-700 block mb-2">
          Pipeline stage
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
  );
}
