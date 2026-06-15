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
} from "lucide-react";

export default function AIDeskWorkspace() {
  const { selectedLead, setActiveTab } = useConversations();

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

  const cards = [
    {
      id: "intent",
      title: "Intent Analysis",
      description: "Detect customer purchase intent, urgency levels, and query categorization in real-time.",
      icon: Brain,
      iconColor: "text-purple-600 bg-purple-50 border-purple-100",
      // Custom abstract dashed visual layout
      visual: (
        <div className="mt-4 space-y-2.5 rounded-xl border border-dashed border-slate-200 p-3 bg-slate-50/50">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
            <span>PURCHASE PROBABILITY</span>
            <span className="h-2 w-16 rounded-full bg-slate-200 animate-pulse" />
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-200/60 overflow-hidden">
            <div className="h-full w-2/3 rounded-full bg-slate-300/60 border-r border-dashed border-slate-400/50" />
          </div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="h-4 w-16 rounded bg-slate-200/80" />
            <span className="h-4 w-20 rounded bg-slate-200/60" />
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
        <div className="mt-4 space-y-2 rounded-xl border border-dashed border-slate-200 p-3 bg-slate-50/50">
          <div className="h-2 w-5/6 rounded bg-slate-200/80" />
          <div className="h-2 w-4/6 rounded bg-slate-200/60" />
          <div className="h-2 w-3/6 rounded bg-slate-200/40" />
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
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-2 bg-slate-50/30">
            <span className="h-3 w-3 rounded-full border border-slate-300" />
            <span className="h-2 w-32 rounded bg-slate-200/80" />
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-2 bg-slate-50/30">
            <span className="h-3 w-3 rounded-full border border-slate-300" />
            <span className="h-2 w-24 rounded bg-slate-200/60" />
          </div>
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
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-dashed border-slate-200 p-3 bg-slate-50/50">
          <div className="h-4 w-4 rounded-full bg-slate-200 animate-pulse shrink-0" />
          <div className="space-y-1.5 flex-1">
            <div className="h-2 w-24 rounded bg-slate-200/80" />
            <div className="h-2 w-36 rounded bg-slate-200/50" />
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
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-3 bg-slate-50/50 flex items-center justify-between gap-4">
          <div className="space-y-1.5 flex-1">
            <div className="h-2.5 w-16 rounded bg-slate-200/80" />
            <div className="h-2 w-28 rounded bg-slate-200/50" />
          </div>
          {/* Mock Chart Shimmer */}
          <div className="flex items-end gap-1 h-8">
            <span className="h-3 w-2.5 rounded bg-slate-200/30" />
            <span className="h-5 w-2.5 rounded bg-slate-200/50" />
            <span className="h-8 w-2.5 rounded bg-slate-200/70 animate-pulse" />
            <span className="h-4 w-2.5 rounded bg-slate-200/40" />
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
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
            <span className="h-2 w-16 rounded bg-slate-200/80" />
            <span className="text-[9px] text-slate-300 font-medium">10:30 AM</span>
          </div>
          <div className="ml-0.5 my-1.5 h-3 w-0.5 border-l border-dashed border-slate-300" />
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
            <span className="h-2 w-20 rounded bg-slate-200/50" />
            <span className="text-[9px] text-slate-300 font-medium">10:45 AM</span>
          </div>
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
