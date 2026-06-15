"use client";

import { useConversations, Lead, FilterType } from "./ConversationsContext";
import {
  Search,
  MessageCircle,
  Instagram,
  Flame,
  AlertCircle,
  UserCheck,
  Bot,
  SlidersHorizontal,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { EmptyState, RetryState, SkeletonCard } from "@/components/ui/feedback";
import React from "react";

// Custom inline SVG for WhatsApp matching brand standards
const WhatsAppIcon = ({ className = "h-3.5 w-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.717-1.456L0 24zm6.59-4.846c1.6.95 3.488 1.449 5.407 1.451 5.394 0 9.782-4.385 9.785-9.778.002-2.613-1.015-5.07-2.863-6.92C17.127 2.057 14.67 1.04 12.062 1.04c-5.398 0-9.786 4.388-9.79 9.781 0 1.922.502 3.799 1.457 5.409l-.959 3.502 3.585-.94zm11.396-7.397c-.314-.157-1.858-.917-2.143-1.02-.284-.105-.49-.157-.696.157-.206.314-.799.102-.979.314-.18.213-.36.242-.674.085-.314-.157-1.325-.488-2.525-1.558-.934-.834-1.564-1.866-1.747-2.18-.182-.314-.02-.485.137-.64.14-.14.314-.366.47-.549.157-.183.21-.314.314-.523.105-.21.052-.392-.026-.549-.079-.157-.696-1.678-.954-2.298-.25-.6-.54-.515-.742-.525l-.63-.01c-.206 0-.54.077-.822.387-.282.31-1.077 1.053-1.077 2.567s1.103 2.977 1.258 3.186c.155.21 2.17 3.313 5.258 4.643.734.317 1.309.507 1.758.65.738.234 1.41.2 1.942.122.593-.087 1.858-.758 2.12-1.449.26-.69.26-1.28.18-1.41-.08-.13-.28-.21-.59-.367z" />
  </svg>
);

function getLeadDisplayName(lead: Lead) {
  const platform = (lead?.platform || "").toUpperCase();

  if (platform === "WHATSAPP") {
    return lead?.phone || lead?.name || lead?.id || "User";
  }

  if (platform === "INSTAGRAM") {
    return lead?.name || (lead?.instagramId ? `@${lead.instagramId}` : lead?.id) || "User";
  }

  return lead?.name || lead?.phone || lead?.id || "User";
}

function formatLeadTime(timeString?: string) {
  if (!timeString) return "";

  try {
    const date = new Date(timeString);
    const now = new Date();

    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }

    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// Formats number into Indian Rupee opportunity currency format
function formatRevenue(val: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(val);
}

export default function InboxWorkspace() {
  const {
    leads,
    selectedLead,
    setSelectedLead,
    leadsLoading,
    leadsError,
    fetchLeads,
    search,
    setSearch,
    filter,
    setFilter,
    filteredLeads,
    leadsIntelligence,
    setActiveTab,
  } = useConversations();

  const handleSelectLead = (lead: Lead) => {
    setSelectedLead(lead);
    setActiveTab("chat");
  };

  // Filter Pills setup with labels, types, and icons
  const filterPills: Array<{ type: FilterType; label: string; icon: LucideIcon; color: string }> = [
    { type: "all", label: "All", icon: SlidersHorizontal, color: "text-slate-500" },
    { type: "hot", label: "Hot", icon: Flame, color: "text-orange-500" },
    { type: "attention", label: "Attention", icon: AlertCircle, color: "text-amber-500" },
    { type: "human", label: "Human", icon: UserCheck, color: "text-rose-500" },
    { type: "ai", label: "AI", icon: Bot, color: "text-purple-500" },
  ];

  // Specific empty state properties tailored to the selected filter
  const getFilterEmptyState = () => {
    switch (filter) {
      case "hot":
        return {
          title: "No hot opportunities found",
          description: "There are no conversations with active purchase intent or price inquiries at the moment.",
        };
      case "attention":
        return {
          title: "No conversations need attention",
          description: "All client messages have been read and there are no urgent support signals.",
        };
      case "human":
        return {
          title: "No human handoffs required",
          description: "Your team is fully caught up. No clients are currently waiting for human representative intervention.",
        };
      case "ai":
        return {
          title: "No active AI handling threads",
          description: "There are no conversations currently managed by active automated AI responders.",
        };
      default:
        return {
          title: "No conversations yet",
          description: "Connect Instagram or WhatsApp to begin receiving messages.",
        };
    }
  };

  const emptyStateContent = getFilterEmptyState();

  return (
    <div className="flex h-full w-full flex-col bg-white/40 backdrop-blur-xl">
      {/* Top Header & Search Panel */}
      <div className="border-b border-slate-200/80 p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              Opportunity Feed
            </h2>
            <p className="text-xs text-slate-500 sm:text-sm">
              Prioritized feed focusing on revenue potential and critical client handoffs.
            </p>
          </div>

          {/* Search bar matching style guidelines */}
          <div className="relative w-full md:max-w-md">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search by name, platform or message content..."
              value={search}
              onChange={(e) => setSearch(e.target.value || "")}
              className="w-full rounded-2xl border border-slate-200 bg-white/70 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-blue-400/35 focus:border-blue-400/80"
            />
          </div>
        </div>

        {/* Instantly Switchable Filter Pills Bar */}
        <div className="flex flex-wrap items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {filterPills.map((pill) => {
            const isSelected = filter === pill.type;
            const PillIcon = pill.icon;

            // Get count for each filter category
            let count = 0;
            if (pill.type === "all") {
              count = leads.length;
            } else {
              count = leads.filter((l) => {
                const intel = leadsIntelligence[l.id];
                if (!intel) return false;
                if (pill.type === "hot") return intel.recommendedBadge === "HOT_OPPORTUNITY";
                if (pill.type === "attention") return intel.recommendedBadge === "NEEDS_ATTENTION";
                if (pill.type === "human") return intel.recommendedBadge === "HUMAN_REQUIRED";
                if (pill.type === "ai") return intel.recommendedBadge === "AI_HANDLING";
                return false;
              }).length;
            }

            return (
              <button
                key={pill.type}
                onClick={() => setFilter(pill.type)}
                className={`
                  inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold cursor-pointer transition-all duration-200 shadow-sm border
                  ${
                    isSelected
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white/80 border-slate-200/60 text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                  }
                `}
              >
                <PillIcon size={13} className={isSelected ? "text-white" : pill.color} />
                <span>{pill.label}</span>
                <span className={`text-[10px] rounded-md px-1.5 py-0.5 font-bold ${
                  isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Feeds scrollable viewport */}
      <div className="flex-1 overflow-y-auto brand-scrollbar p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-4xl w-full">
          
          {/* Skeletons rendering */}
          {leadsLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonCard key={index} className="h-24 sm:h-28 w-full rounded-2xl" />
              ))}
            </div>
          ) : null}

          {/* Errors rendering */}
          {!leadsLoading && leadsError ? (
            <div className="py-8">
              <RetryState
                title="Failed to load your opportunity feed"
                description={leadsError}
                onRetry={() => void fetchLeads()}
              />
            </div>
          ) : null}

          {/* Tailored empty states for filters */}
          {!leadsLoading && !leadsError && filteredLeads.length === 0 ? (
            <div className="mx-auto max-w-xl py-12">
              <EmptyState
                title={emptyStateContent.title}
                description={emptyStateContent.description}
                actionLabel={filter === "all" ? "Connect Channels →" : "Show All Conversations"}
                actionHref={filter === "all" ? "/integrations" : undefined}
                onAction={filter !== "all" ? () => setFilter("all") : undefined}
              />
            </div>
          ) : null}

          {/* Priority-Aware Conversation Feed */}
          {!leadsLoading && !leadsError && filteredLeads.length > 0 ? (
            <div className="space-y-3.5">
              {filteredLeads.map((lead) => {
                const isActive = selectedLead?.id === lead.id;
                const name = getLeadDisplayName(lead);
                const platform = (lead?.platform || "").toUpperCase();
                const lastMessage = lead?.lastMessage || "Waiting for the first message";
                const unreadCount = lead?.unreadCount || 0;
                const formattedTime = formatLeadTime(lead?.lastMessageTime);

                // Intelligence data lookup
                const intel = leadsIntelligence[lead.id];
                const badgeType = intel?.recommendedBadge || "NONE";
                const revenue = intel?.estimatedRevenue;

                // Dynamic avatar setup
                let avatarGradient = "from-blue-600 to-cyan-500";
                let platformBadge = null;

                if (platform === "WHATSAPP") {
                  avatarGradient = "from-emerald-500 to-green-600";
                  platformBadge = (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50/70 px-2 py-0.5 text-[9px] font-bold text-emerald-600 uppercase tracking-wide">
                      <WhatsAppIcon className="h-2.5 w-2.5" />
                      WhatsApp
                    </span>
                  );
                } else if (platform === "INSTAGRAM") {
                  avatarGradient = "from-purple-600 via-pink-500 to-orange-400";
                  platformBadge = (
                    <span className="inline-flex items-center gap-1 rounded-full border border-pink-100 bg-pink-50/70 px-2 py-0.5 text-[9px] font-bold text-pink-600 uppercase tracking-wide">
                      <Instagram size={10} />
                      Instagram
                    </span>
                  );
                } else {
                  platformBadge = (
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50/70 px-2 py-0.5 text-[9px] font-bold text-slate-600 uppercase tracking-wide">
                      <MessageCircle size={10} />
                      Direct
                    </span>
                  );
                }

                // Render recommended priority intelligence badge
                let intelBadgeElement = null;
                switch (badgeType) {
                  case "HUMAN_REQUIRED":
                    intelBadgeElement = (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 uppercase tracking-wider shadow-sm shadow-rose-100/40">
                        <UserCheck size={11} />
                        Human Required
                      </span>
                    );
                    break;
                  case "HOT_OPPORTUNITY":
                    intelBadgeElement = (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700 uppercase tracking-wider shadow-sm shadow-orange-100/40">
                        <Flame size={11} className="animate-pulse" />
                        Hot Opportunity
                      </span>
                    );
                    break;
                  case "NEEDS_ATTENTION":
                    intelBadgeElement = (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 uppercase tracking-wider shadow-sm shadow-amber-100/40">
                        <AlertCircle size={11} />
                        Needs Attention
                      </span>
                    );
                    break;
                  case "AI_HANDLING":
                    intelBadgeElement = (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700 uppercase tracking-wider shadow-sm shadow-purple-100/40">
                        <Bot size={11} />
                        AI Handling
                      </span>
                    );
                    break;
                  default:
                    break;
                }

                return (
                  <button
                    key={lead.id}
                    onClick={() => handleSelectLead(lead)}
                    className={`
                      relative w-full text-left rounded-3xl border transition-all duration-300 p-4 sm:p-5 flex flex-col gap-3 cursor-pointer
                      ${
                        isActive
                          ? "bg-blue-50/80 border-blue-300/80 shadow-md shadow-blue-100/40"
                          : "bg-white/95 border-slate-200/70 hover:bg-slate-50/90 hover:border-slate-300/80 hover:shadow-md hover:shadow-slate-100/40"
                      }
                    `}
                  >
                    {/* Header Row: Avatars, Name, Platforms, Badges & Time */}
                    <div className="flex items-start justify-between gap-4 w-full">
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        {/* Avatar Column */}
                        <div className="relative flex-shrink-0">
                          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-r ${avatarGradient} text-sm font-bold text-white shadow-inner`}>
                            {name.charAt(0).toUpperCase()}
                          </div>
                          {/* Live green dot indicator */}
                          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-green-500 shadow-sm" />
                        </div>

                        {/* Title, Platform & Intelligence Badge block */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-bold tracking-tight text-slate-900 truncate max-w-[140px] sm:max-w-xs">
                              {name}
                            </h4>
                            {platformBadge}
                            <span className="hidden sm:inline-block">
                              {intelBadgeElement}
                            </span>
                          </div>
                          
                          {/* Inline intelligence badge for mobile view */}
                          <div className="mt-1 sm:hidden">
                            {intelBadgeElement}
                          </div>
                        </div>
                      </div>

                      {/* Time and Unread Column */}
                      <div className="flex items-center gap-2 shrink-0">
                        {formattedTime && (
                          <span className="text-[11px] font-semibold text-slate-400">
                            {formattedTime}
                          </span>
                        )}

                        {unreadCount > 0 ? (
                          <span className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                            {unreadCount}
                          </span>
                        ) : null}

                        <ChevronRight size={14} className="text-slate-300 hover:text-slate-400" />
                      </div>
                    </div>

                    {/* Body Row: Last Message Content */}
                    <div className="pl-0 sm:pl-14 min-w-0">
                      <p className="text-xs leading-relaxed text-slate-500 line-clamp-2 sm:line-clamp-1">
                        {lastMessage}
                      </p>
                    </div>

                    {/* Footer Row: Estimated Revenue Opportunity (Displays only for Hot Opportunities) */}
                    {badgeType === "HOT_OPPORTUNITY" && revenue && (
                      <div className="pl-0 sm:pl-14 flex items-center mt-0.5">
                        <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-sm shadow-emerald-100/30">
                          <Flame size={12} className="text-emerald-600 fill-emerald-500/10 animate-pulse" />
                          <span>{formatRevenue(revenue)} Opportunity</span>
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : null}

        </div>
      </div>
    </div>
  );
}
