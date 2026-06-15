"use client";

import { useMemo, useState } from "react";
import { useConversations, Lead } from "./ConversationsContext";
import {
  Search,
  Activity,
  Calendar,
  FileText,
  UserCheck,
  Bot,
  SlidersHorizontal,
  ArrowRight,
  Eye,
  MessageCircle,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Clock,
  Instagram,
  Flame,
  CreditCard,
  CheckCircle,
} from "lucide-react";

// Custom inline SVG for WhatsApp matching brand standards
const WhatsAppIcon = ({ className = "h-3 w-3" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.717-1.456L0 24zm6.59-4.846c1.6.95 3.488 1.449 5.407 1.451 5.394 0 9.782-4.385 9.785-9.778.002-2.613-1.015-5.07-2.863-6.92C17.127 2.057 14.67 1.04 12.062 1.04c-5.398 0-9.786 4.388-9.79 9.781 0 1.922.502 3.799 1.457 5.409l-.959 3.502 3.585-.94zm11.396-7.397c-.314-.157-1.858-.917-2.143-1.02-.284-.105-.49-.157-.696.157-.206.314-.799.102-.979.314-.18.213-.36.242-.674.085-.314-.157-1.325-.488-2.525-1.558-.934-.834-1.564-1.866-1.747-2.18-.182-.314-.02-.485.137-.64.14-.14.314-.366.47-.549.157-.183.21-.314.314-.523.105-.21.052-.392-.026-.549-.079-.157-.696-1.678-.954-2.298-.25-.6-.54-.515-.742-.525l-.63-.01c-.206 0-.54.077-.822.387-.282.31-1.077 1.053-1.077 2.567s1.103 2.977 1.258 3.186c.155.21 2.17 3.313 5.258 4.643.734.317 1.309.507 1.758.65.738.234 1.41.2 1.942.122.593-.087 1.858-.758 2.12-1.449.26-.69.26-1.28.18-1.41-.08-.13-.28-.21-.59-.367z" />
  </svg>
);

export interface AIActivity {
  id: string;
  leadId: string;
  leadName: string;
  platform: string;
  timestamp: string; // ISO string
  timeDisplay: string;
  activityType:
    | "Lead Qualified"
    | "Pricing Shared"
    | "Objection Handled"
    | "Meeting Offered"
    | "Meeting Booked"
    | "Proposal Sent"
    | "Follow-up Scheduled"
    | "Payment Link Shared"
    | "Deal Closed"
    | "Human Override Activated"
    | "AI Resumed";
  summary: string;
  description: string;
  status: "success" | "progress" | "attention";
  statusText: string;
  type: "sales" | "meetings" | "proposals" | "closures" | "intervention";
}

function getLeadHash(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

// Generate stable, deterministic activity events for testing/observability
function generateActivitiesForLeads(
  leads: Lead[],
  modes: Record<string, string>
): AIActivity[] {
  const list: AIActivity[] = [];

  leads.forEach((lead) => {
    const hash = getLeadHash(lead.id);
    const mode = modes[lead.id] || "AUTONOMOUS";
    const baseTime = lead.lastMessageTime ? Date.parse(lead.lastMessageTime) : Date.now();

    // Helper to generate ISO string offset in ms
    const timeAtOffset = (offsetMinutes: number) => {
      return new Date(baseTime - offsetMinutes * 60 * 1000).toISOString();
    };

    const timeDisplay = (isoStr: string) => {
      try {
        const d = new Date(isoStr);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      } catch {
        return "10:00 AM";
      }
    };

    // 1. Lead Qualified (Always)
    const tQualified = timeAtOffset(120 + (hash % 60));
    list.push({
      id: `${lead.id}-qualified`,
      leadId: lead.id,
      leadName: lead.name || "Lead Customer",
      platform: lead.platform || "INSTAGRAM",
      timestamp: tQualified,
      timeDisplay: timeDisplay(tQualified),
      activityType: "Lead Qualified",
      summary: "Lead qualified successfully",
      description: "Sales AI verified buyer intent, requirements, and budget fit.",
      status: "success",
      statusText: "✓ Completed",
      type: "sales",
    });

    // 2. Pricing Shared (Always)
    const tPricing = timeAtOffset(90 + (hash % 30));
    list.push({
      id: `${lead.id}-pricing`,
      leadId: lead.id,
      leadName: lead.name || "Lead Customer",
      platform: lead.platform || "INSTAGRAM",
      timestamp: tPricing,
      timeDisplay: timeDisplay(tPricing),
      activityType: "Pricing Shared",
      summary: "Shared package pricing details",
      description: "Sales AI sent standard commercial packages information sheet.",
      status: "success",
      statusText: "✓ Completed",
      type: "sales",
    });

    // 3. Conditional: Objection Handled & Follow-up
    if (hash % 3 === 0) {
      const tObjection = timeAtOffset(60 + (hash % 15));
      list.push({
        id: `${lead.id}-objection`,
        leadId: lead.id,
        leadName: lead.name || "Lead Customer",
        platform: lead.platform || "INSTAGRAM",
        timestamp: tObjection,
        timeDisplay: timeDisplay(tObjection),
        activityType: "Objection Handled",
        summary: "Handled price objection",
        description: "Sales AI clarified standard plan values and onboarding fee inclusions.",
        status: "success",
        statusText: "✓ Completed",
        type: "sales",
      });

      const tFollowup = timeAtOffset(15);
      list.push({
        id: `${lead.id}-followup`,
        leadId: lead.id,
        leadName: lead.name || "Lead Customer",
        platform: lead.platform || "INSTAGRAM",
        timestamp: tFollowup,
        timeDisplay: timeDisplay(tFollowup),
        activityType: "Follow-up Scheduled",
        summary: "Follow-up outreach scheduled",
        description: "Automated touchpoint configured for 48 hours to progress interest.",
        status: "success",
        statusText: "✓ Completed",
        type: "meetings",
      });
    }

    // 4. Conditional: Meeting Offered & Meeting Booked
    if (hash % 3 === 1) {
      const tMeetOffer = timeAtOffset(45);
      list.push({
        id: `${lead.id}-meet-offer`,
        leadId: lead.id,
        leadName: lead.name || "Lead Customer",
        platform: lead.platform || "INSTAGRAM",
        timestamp: tMeetOffer,
        timeDisplay: timeDisplay(tMeetOffer),
        activityType: "Meeting Offered",
        summary: "Demo call scheduler shared",
        description: "Sent booking link invitation for standard demo introduction session.",
        status: "success",
        statusText: "✓ Completed",
        type: "meetings",
      });

      const tMeetBook = timeAtOffset(10);
      list.push({
        id: `${lead.id}-meet-book`,
        leadId: lead.id,
        leadName: lead.name || "Lead Customer",
        platform: lead.platform || "INSTAGRAM",
        timestamp: tMeetBook,
        timeDisplay: timeDisplay(tMeetBook),
        activityType: "Meeting Booked",
        summary: "Demo call confirmed",
        description: "Client booked demo slot for tomorrow at 3:00 PM. Calendar invite sent.",
        status: "success",
        statusText: "✓ Completed",
        type: "meetings",
      });
    }

    // 5. Conditional: Proposal Sent & Payment Link Shared
    if (hash % 3 === 2) {
      const tProposal = timeAtOffset(35);
      list.push({
        id: `${lead.id}-proposal`,
        leadId: lead.id,
        leadName: lead.name || "Lead Customer",
        platform: lead.platform || "INSTAGRAM",
        timestamp: tProposal,
        timeDisplay: timeDisplay(tProposal),
        activityType: "Proposal Sent",
        summary: "Proposal agreement generated",
        description: "Created and sent digital proposal draft representing value ₹1,20,000.",
        status: "progress",
        statusText: "⏳ Active",
        type: "proposals",
      });

      const tPayment = timeAtOffset(5);
      list.push({
        id: `${lead.id}-payment`,
        leadId: lead.id,
        leadName: lead.name || "Lead Customer",
        platform: lead.platform || "INSTAGRAM",
        timestamp: tPayment,
        timeDisplay: timeDisplay(tPayment),
        activityType: "Payment Link Shared",
        summary: "Secure checkout link provided",
        description: "Shared payment gateway billing token for initial setup charges.",
        status: "progress",
        statusText: "⏳ Active",
        type: "closures",
      });
    }

    // 6. Real-time Overrides triggers
    if (mode === "HUMAN_OVERRIDE") {
      const tOverride = timeAtOffset(2);
      list.push({
        id: `${lead.id}-override`,
        leadId: lead.id,
        leadName: lead.name || "Lead Customer",
        platform: lead.platform || "INSTAGRAM",
        timestamp: tOverride,
        timeDisplay: timeDisplay(tOverride),
        activityType: "Human Override Activated",
        summary: "Human Override control triggered",
        description: "Founder took manual control. Sales AI automated responder paused.",
        status: "attention",
        statusText: "⚠ Review Needed",
        type: "intervention",
      });
    } else if (mode === "AUTONOMOUS" && hash % 2 === 0) {
      const tResume = timeAtOffset(1);
      list.push({
        id: `${lead.id}-resume`,
        leadId: lead.id,
        leadName: lead.name || "Lead Customer",
        platform: lead.platform || "INSTAGRAM",
        timestamp: tResume,
        timeDisplay: timeDisplay(tResume),
        activityType: "AI Resumed",
        summary: "Sales AI resumed automation",
        description: "AI regained control and restored context. Previous flows active.",
        status: "success",
        statusText: "✓ Completed",
        type: "intervention",
      });
    }

    // 7. Deal Closed trigger for hot opportunities
    const isHot = lead.id && hash % 5 === 0;
    if (isHot) {
      const tClosed = timeAtOffset(1);
      list.push({
        id: `${lead.id}-closed`,
        leadId: lead.id,
        leadName: lead.name || "Lead Customer",
        platform: lead.platform || "INSTAGRAM",
        timestamp: tClosed,
        timeDisplay: timeDisplay(tClosed),
        activityType: "Deal Closed",
        summary: "Deal marked won - closed!",
        description: "Onboarding payment captured and verified. Workspace access provisioned.",
        status: "success",
        statusText: "✓ Completed",
        type: "closures",
      });
    }
  });

  // Sort in reverse chronological order
  return list.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

export default function AIActivityWorkspace() {
  const { leads, conversationModes, setSelectedLead, setActiveTab } = useConversations();
  const [activeFilter, setActiveFilter] = useState<
    "all" | "sales" | "meetings" | "proposals" | "closures" | "intervention"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Memoized activity feed generation
  const allActivities = useMemo(() => {
    return generateActivitiesForLeads(leads, conversationModes);
  }, [leads, conversationModes]);

  // Client-side optimized filtering and search
  const filteredActivities = useMemo(() => {
    return allActivities.filter((act) => {
      // 1. Category Filter
      if (activeFilter !== "all" && act.type !== activeFilter) {
        return false;
      }
      // 2. Search Query
      const query = searchQuery.trim().toLowerCase();
      if (query) {
        const leadMatch = act.leadName.toLowerCase().includes(query);
        const typeMatch = act.activityType.toLowerCase().includes(query);
        const descMatch = act.description.toLowerCase().includes(query);
        return leadMatch || typeMatch || descMatch;
      }
      return true;
    });
  }, [allActivities, activeFilter, searchQuery]);

  const filterPills: Array<{
    id: typeof activeFilter;
    label: string;
    icon: any;
  }> = [
    { id: "all", label: "All", icon: SlidersHorizontal },
    { id: "sales", label: "Sales", icon: Flame },
    { id: "meetings", label: "Meetings", icon: Calendar },
    { id: "proposals", label: "Proposals", icon: FileText },
    { id: "closures", label: "Closures", icon: CheckCircle },
    { id: "intervention", label: "Human Intervention", icon: UserCheck },
  ];

  const handleOpenChat = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (lead) {
      setSelectedLead(lead);
      setActiveTab("chat");
    }
  };

  const handleOpenLeadDetails = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (lead) {
      setSelectedLead(lead);
      setActiveTab("ai");
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-white/40 backdrop-blur-xl overflow-hidden">
      {/* Sticky Header Panel with Compressed Padding */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3.5 py-2.5 sm:px-5 sm:py-3 flex flex-col gap-2.5 shrink-0">
        
        {/* Desktop Single-Row Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Activity size={14} />
            </span>
            <h2 className="text-sm font-bold tracking-tight text-slate-900">
              Sales AI Activity Feed
            </h2>
          </div>

          {/* Compressed Search input */}
          <div className="relative w-full sm:w-60 lg:w-68">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search activity..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value || "")}
              className="w-full rounded-xl border border-slate-200 bg-white/70 py-1.5 pl-8 pr-3 text-[11px] outline-none transition focus:ring-1 focus:ring-blue-400/40 focus:border-blue-400/60"
            />
          </div>
        </div>

        {/* Sticky Filter Pills Row */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {filterPills.map((pill) => {
            const isSelected = activeFilter === pill.id;
            const PillIcon = pill.icon;

            return (
              <button
                key={pill.id}
                onClick={() => setActiveFilter(pill.id)}
                className={`
                  inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold cursor-pointer transition-all duration-200 border whitespace-nowrap
                  ${
                    isSelected
                      ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                      : "bg-white/80 border-slate-200/50 text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                  }
                `}
              >
                <PillIcon size={11} className={isSelected ? "text-white" : "text-slate-400"} />
                <span>{pill.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Feed List Container */}
      <div className="flex-1 overflow-y-auto pr-1 pl-2 py-4 sm:px-5">
        {filteredActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-12 border border-dashed border-slate-200 bg-white/20 rounded-3xl">
            <Activity size={24} className="text-slate-300 animate-pulse" />
            <h4 className="text-sm font-semibold text-slate-800 mt-3">No activity logs found</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              No recent logs match the query. Try adjusting your search query or select another filter.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredActivities.map((act) => {
              const statusColors =
                act.status === "success"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                  : act.status === "progress"
                  ? "bg-blue-50 text-blue-700 border-blue-100"
                  : "bg-amber-50 text-amber-700 border-amber-100";

              return (
                <div
                  key={act.id}
                  className="brand-panel hover:shadow-md transition-all duration-200 rounded-[24px] border border-slate-200/60 p-4 bg-white/80"
                >
                  {/* DESKTOP LAYOUT */}
                  <div className="hidden md:flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase flex items-center gap-1">
                          <Clock size={10} />
                          {act.timeDisplay}
                        </span>
                        <span className="text-slate-300">•</span>
                        <button
                          onClick={() => handleOpenChat(act.leadId)}
                          className="text-xs font-bold text-slate-900 hover:text-blue-600 transition"
                        >
                          {act.leadName}
                        </button>
                        {act.platform.toUpperCase() === "WHATSAPP" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[8px] font-bold text-emerald-600 uppercase border border-emerald-100">
                            <WhatsAppIcon className="h-2.5 w-2.5" />
                            WhatsApp
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[8px] font-bold text-purple-600 uppercase border border-purple-100">
                            <Instagram size={10} />
                            Instagram
                          </span>
                        )}
                      </div>

                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase border ${statusColors}`}>
                        {act.statusText}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <h4 className="text-xs font-bold text-slate-900">{act.activityType}</h4>
                      <p className="text-[11px] text-slate-500 leading-normal">{act.description}</p>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Operational Log • {act.type}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenLeadDetails(act.leadId)}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-800 transition"
                        >
                          <Eye size={10} />
                          <span>View Details</span>
                        </button>
                        <button
                          onClick={() => handleOpenChat(act.leadId)}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 transition"
                        >
                          <span>Open Chat</span>
                          <ArrowRight size={10} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* MOBILE LAYOUT */}
                  <div className="flex md:hidden flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{act.leadName}</span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase border ${statusColors}`}>
                        {act.statusText}
                      </span>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <h4 className="text-[11px] font-bold text-slate-800">{act.activityType}</h4>
                      <p className="text-[10px] text-slate-500 leading-normal">{act.description}</p>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[9px] text-slate-400">
                      <span>{act.timeDisplay}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenChat(act.leadId)}
                          className="font-bold text-blue-600 hover:text-blue-800"
                        >
                          Open Chat
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
