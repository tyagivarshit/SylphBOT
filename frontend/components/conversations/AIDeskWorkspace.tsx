"use client";

import { useConversations } from "./ConversationsContext";
import {
  Brain,
  Sparkles,
  Zap,
  ShieldAlert,
  Activity,
  GitCommit,
  FileText,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

export default function AIDeskWorkspace() {
  const { selectedLead, setActiveTab, leadsIntelligence } = useConversations();

  // If no conversation is selected, show a beautiful, clean empty state
  if (!selectedLead) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-white/40 p-6 backdrop-blur-xl">
        <div className="mx-auto max-w-md w-full text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 text-blue-600 shadow-sm animate-pulse">
            <Brain size={24} />
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            No conversation selected
          </h3>
          <p className="mt-2 text-sm text-slate-500 leading-6">
            Choose a conversation from your Inbox to see AI-driven intent analysis, objection detection, summaries, and recommendation timelines.
          </p>
          <button
            onClick={() => setActiveTab("inbox")}
            className="brand-button-primary mt-6 mx-auto inline-flex items-center gap-2 cursor-pointer"
          >
            Open Inbox
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  // Get active intelligence signals for the selected lead
  const intel = leadsIntelligence[selectedLead.id];
  const badgeType = intel?.recommendedBadge || "NONE";

  // 1. Dynamic Intent Analysis values
  const getIntentProbability = () => {
    if (badgeType === "HOT_OPPORTUNITY") return { pct: 92, label: "HIGH PURCHASE INTENT" };
    if (badgeType === "HUMAN_REQUIRED") return { pct: 55, label: "INTERVENTION REQUIRED" };
    if (badgeType === "NEEDS_ATTENTION") return { pct: 70, label: "MEDIUM PRIORITY QUERY" };
    return { pct: 25, label: "LOW ROUTINE QUERY" };
  };
  const intent = getIntentProbability();

  // 2. Dynamic Conversation Summary bullets
  const getConversationSummary = () => {
    const platform = selectedLead.platform || "Meta Channel";

    if (badgeType === "HUMAN_REQUIRED") {
      return [
        `Client started conversation via ${platform}.`,
        `AI assistant greeted client and attempted qualification.`,
        `⚠️ Flagged: Client explicitly requested human agent assistance.`
      ];
    }
    if (badgeType === "HOT_OPPORTUNITY") {
      return [
        `Client expressed interest in buying options via ${platform}.`,
        `AI responded with high-level packages and product highlights.`,
        `🔥 Thread classified: Hot commercial inquiry active.`
      ];
    }
    return [
      `User initiated thread via ${platform}.`,
      `Bot responder handled routine greetings successfully.`,
      `Conversation currently waiting for next user touchpoint.`
    ];
  };
  const summaryBullets = getConversationSummary();

  // 3. Dynamic Recommended Actions list
  const getRecommendedActions = () => {
    switch (badgeType) {
      case "HUMAN_REQUIRED":
        return [
          "Manage the conversation personally.",
          "Review previous customer support history."
        ];
      case "HOT_OPPORTUNITY":
        return [
          "Send product brochure and commercial pricing details.",
          "Suggest calendar booking link for demo session."
        ];
      case "NEEDS_ATTENTION":
        return [
          "Reply directly to query within 5 minutes.",
          "Confirm client issues are resolved."
        ];
      case "AI_HANDLING":
        return [
          "Monitor active automated bot responses.",
          "Intervene if query deviates from template scopes."
        ];
      default:
        return [
          "Manage the conversation personally.",
          "Acknowledge recent customer query."
        ];
    }
  };
  const actionsList = getRecommendedActions();

  // 4. Dynamic Objections list
  const getObjections = () => {
    if (badgeType === "HOT_OPPORTUNITY") {
      return {
        objection: "Pricing Concern Detected",
        detail: "Client asked 'how much' - potential cost objection context."
      };
    }
    if (badgeType === "HUMAN_REQUIRED") {
      return {
        objection: "Handoff Request Detected",
        detail: "Client requested human staff - AI template out of scope."
      };
    }
    return {
      objection: "No Objections Detected",
      detail: "No active buyer friction or pricing complaints detected in logs."
    };
  };
  const objectionData = getObjections();

  // 5. Dynamic Customer Signals
  const getSignals = () => {
    if (badgeType === "HOT_OPPORTUNITY") return { sentiment: "Positive (Buyer)", score: "High Potential" };
    if (badgeType === "HUMAN_REQUIRED") return { sentiment: "Neutral / Urgent", score: "Handoff Signal" };
    if (badgeType === "NEEDS_ATTENTION") return { sentiment: "Needs Reply", score: "SLA Risk" };
    return { sentiment: "Routine", score: "AI Handled" };
  };
  const signals = getSignals();

  // 6. Dynamic Timeline Events
  const getTimeline = () => {
    if (badgeType === "HUMAN_REQUIRED") {
      return [
        { text: "Handoff Triggered", time: "Just now" },
        { text: "User Requested Person", time: "5m ago" }
      ];
    }
    if (badgeType === "HOT_OPPORTUNITY") {
      return [
        { text: "Pricing Query Detected", time: "2m ago" },
        { text: "AI Greeting Sent", time: "6m ago" }
      ];
    }
    return [
      { text: "Thread Monitored", time: "Just now" },
      { text: "Session Initiated", time: "15m ago" }
    ];
  };
  const timelineEvents = getTimeline();

  const cards = [
    {
      id: "intent",
      title: "Intent Analysis",
      description: "Detect customer purchase intent, urgency levels, and query categorization in real-time.",
      icon: Brain,
      iconColor: "text-purple-600 bg-purple-50 border-purple-100",
      visual: (
        <div className="mt-4 space-y-2.5 rounded-xl border border-dashed border-slate-200 p-3 bg-slate-50/50">
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
            <span>{intent.label}</span>
            <span className="text-[10px] text-purple-600 font-extrabold">{intent.pct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-200/60 overflow-hidden">
            <div 
              className="h-full rounded-full bg-purple-500 transition-all duration-500 ease-out" 
              style={{ width: `${intent.pct}%` }}
            />
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="h-4 rounded bg-purple-50 px-1.5 py-0.5 text-[8px] font-bold text-purple-600 uppercase border border-purple-100">
              {badgeType === "HOT_OPPORTUNITY" ? "Hot Lead" : "Standard"}
            </span>
          </div>
        </div>
      ),
    },
    {
      id: "summary",
      title: "Conversation Summary",
      description: "Get instant, bulleted summaries of historical context and unresolved customer queries.",
      icon: FileText,
      iconColor: "text-blue-600 bg-blue-50 border-blue-100",
      visual: (
        <div className="mt-4 space-y-2 rounded-xl border border-dashed border-slate-200 p-3 bg-slate-50/50 text-[10px] text-slate-500">
          {summaryBullets.map((bullet, idx) => (
            <div key={idx} className="flex items-start gap-1.5">
              <span className="mt-1 flex-shrink-0 h-1 w-1 rounded-full bg-blue-400" />
              <p className="leading-normal">{bullet}</p>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "actions",
      title: "Recommended Actions",
      description: "Next-step prompts and contextual reply suggestions curated by your brand AI.",
      icon: Zap,
      iconColor: "text-amber-600 bg-amber-50 border-amber-100",
      visual: (
        <div className="mt-4 space-y-2">
          {actionsList.map((action, idx) => (
            <div key={idx} className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-2 bg-slate-50/30 text-[10px] text-slate-600 font-semibold">
              <CheckCircle2 size={12} className="text-amber-500 shrink-0" />
              <span className="truncate">{action}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "objections",
      title: "Objections",
      description: "Identify and track customer hesitations, pricing concerns, and feature comparisons.",
      icon: ShieldAlert,
      iconColor: "text-rose-600 bg-rose-50 border-rose-100",
      visual: (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-dashed border-slate-200 p-3 bg-slate-50/50 text-[10px]">
          <div className="h-5 w-5 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 shrink-0 font-bold animate-pulse">
            !
          </div>
          <div className="space-y-1 flex-1">
            <div className="font-bold text-slate-800">{objectionData.objection}</div>
            <div className="text-slate-500 leading-normal">{objectionData.detail}</div>
          </div>
        </div>
      ),
    },
    {
      id: "signals",
      title: "Customer Signals",
      description: "Monitor sentiment trends, response latency spikes, and high-value conversion indicators.",
      icon: Activity,
      iconColor: "text-emerald-600 bg-emerald-50 border-emerald-100",
      visual: (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-3 bg-slate-50/50 flex items-center justify-between gap-4 text-[10px]">
          <div className="space-y-1 flex-1">
            <div className="font-bold text-slate-800">{signals.sentiment}</div>
            <div className="text-slate-500">{signals.score}</div>
          </div>
          {/* Mock sparkline trend */}
          <div className="flex items-end gap-1 h-8 shrink-0">
            <span className="h-3 w-1.5 rounded bg-emerald-200/50" />
            <span className="h-5 w-1.5 rounded bg-emerald-300/60" />
            <span className="h-8 w-1.5 rounded bg-emerald-500/80 animate-pulse" />
            <span className="h-4 w-1.5 rounded bg-emerald-300/40" />
          </div>
        </div>
      ),
    },
    {
      id: "timeline",
      title: "Timeline",
      description: "Visual timeline of key touchpoints, automation triggers, and human handoffs.",
      icon: GitCommit,
      iconColor: "text-indigo-600 bg-indigo-50 border-indigo-100",
      visual: (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-3 bg-slate-50/50 text-[10px]">
          {timelineEvents.map((event, idx) => (
            <div key={idx}>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                <span className="font-bold text-slate-700">{event.text}</span>
                <span className="text-[9px] text-slate-400 font-semibold">{event.time}</span>
              </div>
              {idx < timelineEvents.length - 1 && (
                <div className="ml-[3px] my-1.5 h-3 w-0.5 border-l border-dashed border-slate-300" />
              )}
            </div>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="flex h-full w-full flex-col bg-white/40 backdrop-blur-xl">
      {/* Top Header Panel */}
      <div className="border-b border-slate-200/80 p-4 sm:p-5 flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-blue-600" />
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              AI Conversation Intelligence
            </h2>
          </div>
          <p className="text-xs text-slate-500 sm:text-sm">
            Insights and recommendations will appear here for{" "}
            <span className="font-semibold text-slate-700">
              {selectedLead.name || selectedLead.phone || "Instagram Client"}
            </span>
          </p>
        </div>
      </div>

      {/* Grid of Coming Soon Cards */}
      <div className="flex-1 overflow-y-auto brand-scrollbar p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl w-full">
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => {
              const Icon = card.icon;

              return (
                <div
                  key={card.id}
                  className="group relative flex flex-col justify-between rounded-3xl border border-slate-200/60 bg-white/80 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-md hover:shadow-blue-50/40"
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between gap-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${card.iconColor}`}>
                        <Icon size={16} />
                      </div>

                      {/* Coming Soon Pill */}
                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                        Coming Soon
                      </span>
                    </div>

                    {/* Content */}
                    <h3 className="mt-4 text-sm font-semibold text-slate-900">
                      {card.title}
                    </h3>
                    
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">
                      {card.description}
                    </p>
                  </div>

                  {/* Visual Shimmer Mock */}
                  {card.visual}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
