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
import { RetryState, SkeletonCard } from "@/components/ui/feedback";
import React from "react";

// Custom inline SVG for WhatsApp matching brand standards
const WhatsAppIcon = ({ className = "h-3 w-3" }: { className?: string }) => (
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

function formatRevenue(val: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(val);
}

// Enterprise compact target empty state
function CompactEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center p-5 border border-dashed border-slate-200 bg-slate-50/50 rounded-2xl max-w-sm mx-auto h-[200px]">
      <MessageCircle size={22} className="text-slate-400 mb-2 animate-pulse" />
      <h3 className="text-xs font-bold text-slate-900">Inbox is empty.</h3>
      <p className="text-[10px] text-slate-500 mt-1 max-w-[200px]">
        Connect a channel to begin receiving conversations.
      </p>
      <a
        href="/integrations"
        className="brand-button-primary mt-3 py-1.5 px-3 text-xs rounded-xl inline-flex items-center gap-1.5"
      >
        Connect Channels
      </a>
    </div>
  );
}

// Enterprise compact filtered results empty state
interface CompactFilteredEmptyStateProps {
  title: string;
  description: string;
  onClear: () => void;
}

function CompactFilteredEmptyState({ title, description, onClear }: CompactFilteredEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-5 border border-dashed border-slate-200 bg-slate-50/50 rounded-2xl max-w-sm mx-auto h-[200px]">
      <SlidersHorizontal size={18} className="text-slate-400 mb-2" />
      <h3 className="text-xs font-bold text-slate-900">{title}</h3>
      <p className="text-[10px] text-slate-500 mt-1 max-w-[220px]">
        {description}
      </p>
      <button
        onClick={onClear}
        className="brand-button-secondary mt-3 py-1.5 px-3 text-xs rounded-xl cursor-pointer"
      >
        Clear Filters
      </button>
    </div>
  );
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

  const filterPills: Array<{ type: FilterType; label: string; icon: LucideIcon; color: string }> = [
    { type: "all", label: "All", icon: SlidersHorizontal, color: "text-slate-500" },
    { type: "hot", label: "Hot", icon: Flame, color: "text-orange-500" },
    { type: "attention", label: "Attention", icon: AlertCircle, color: "text-amber-500" },
    { type: "human", label: "Human", icon: UserCheck, color: "text-rose-500" },
    { type: "ai", label: "AI", icon: Bot, color: "text-purple-500" },
  ];

  const getFilterEmptyState = () => {
    switch (filter) {
      case "hot":
        return {
          title: "No hot opportunities found",
          description: "There are no conversations with active purchase intent or price inquiries.",
        };
      case "attention":
        return {
          title: "No conversations need attention",
          description: "All client messages have been read and there are no urgent support signals.",
        };
      case "human":
        return {
          title: "No human handoffs required",
          description: "Your team is fully caught up. No clients are currently waiting for human intervention.",
        };
      case "ai":
        return {
          title: "No active AI handling threads",
          description: "There are no conversations currently managed by active automated AI responders.",
        };
      default:
        return {
          title: "Inbox is empty.",
          description: "Connect a channel to begin receiving conversations.",
        };
    }
  };

  const emptyStateContent = getFilterEmptyState();

  return (
    <div className="flex h-full w-full flex-col bg-white/40 backdrop-blur-xl overflow-hidden">
      {/* Sticky Header Panel with Compressed Padding (reduced by 30-40%) */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3.5 py-2.5 sm:px-5 sm:py-3 flex flex-col gap-2.5 shrink-0">
        
        {/* Desktop Single-Row Header (Title Left, Search Input Right) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-sm font-bold tracking-tight text-slate-900">
            Opportunity Feed
          </h2>

          {/* Compressed Search input with smaller height and padding */}
          <div className="relative w-full sm:w-60 lg:w-68">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value || "")}
              className="w-full rounded-xl border border-slate-200 bg-white/70 py-1.5 pl-8 pr-3 text-[11px] outline-none transition focus:ring-1 focus:ring-blue-400/40 focus:border-blue-400/60"
            />
          </div>
        </div>

        {/* Sticky Filter Pills Row */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {filterPills.map((pill) => {
            const isSelected = filter === pill.type;
            const PillIcon = pill.icon;

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
                  inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold cursor-pointer transition-all duration-200 border
                  ${
                    isSelected
                      ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                      : "bg-white/80 border-slate-200/50 text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                  }
                `}
              >
                <PillIcon size={11} className={isSelected ? "text-white" : pill.color} />
                <span>{pill.label}</span>
                <span className={`text-[9px] rounded px-1.5 py-0.5 font-bold ${
                  isSelected ? "bg-white/20 text-white" : "bg-slate-100/80 text-slate-500"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Viewport with Adaptive Padding */}
      <div className="flex-1 overflow-y-auto brand-scrollbar p-3.5 sm:p-4 lg:p-5">
        <div className="mx-auto max-w-4xl w-full">
          
          {/* Loading Skeletons */}
          {leadsLoading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 5 }).map((_, index) => (
                <SkeletonCard key={index} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : null}

          {/* Errors */}
          {!leadsLoading && leadsError ? (
            <div className="py-4">
              <RetryState
                title="Failed to load your opportunity feed"
                description={leadsError}
                onRetry={() => void fetchLeads()}
              />
            </div>
          ) : null}

          {/* Target Compact Empty State (Inbox completely empty) */}
          {!leadsLoading && !leadsError && leads.length === 0 ? (
            <div className="py-10">
              <CompactEmptyState />
            </div>
          ) : null}

          {/* Target Filtered Empty State (Leads exist, but search/filter has no match) */}
          {!leadsLoading && !leadsError && leads.length > 0 && filteredLeads.length === 0 ? (
            <div className="py-10">
              <CompactFilteredEmptyState
                title={emptyStateContent.title}
                description={emptyStateContent.description}
                onClear={() => {
                  setFilter("all");
                  setSearch("");
                }}
              />
            </div>
          ) : null}

          {/* Premium Enterprise Conversation Cards Feed */}
          {!leadsLoading && !leadsError && filteredLeads.length > 0 ? (
            <div className="space-y-2">
              {filteredLeads.map((lead) => {
                const isActive = selectedLead?.id === lead.id;
                const name = getLeadDisplayName(lead);
                const platform = (lead?.platform || "").toUpperCase();
                const lastMessage = lead?.lastMessage || "Waiting for the first message";
                const unreadCount = lead?.unreadCount || 0;
                const formattedTime = formatLeadTime(lead?.lastMessageTime);

                const intel = leadsIntelligence[lead.id];
                const badgeType = intel?.recommendedBadge || "NONE";
                const revenue = intel?.estimatedRevenue;

                let avatarGradient = "from-blue-600 to-cyan-500";
                let platformBadge = null;

                if (platform === "WHATSAPP") {
                  avatarGradient = "from-emerald-500 to-green-600";
                  platformBadge = (
                    <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-100 bg-emerald-50/70 px-1.5 py-0.5 text-[8px] font-bold text-emerald-600 uppercase tracking-wide">
                      <WhatsAppIcon className="h-2 w-2" />
                      WhatsApp
                    </span>
                  );
                } else if (platform === "INSTAGRAM") {
                  avatarGradient = "from-purple-600 via-pink-500 to-orange-400";
                  platformBadge = (
                    <span className="inline-flex items-center gap-0.5 rounded-full border border-pink-100 bg-pink-50/70 px-1.5 py-0.5 text-[8px] font-bold text-pink-600 uppercase tracking-wide">
                      <Instagram size={8} />
                      Instagram
                    </span>
                  );
                } else {
                  platformBadge = (
                    <span className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-slate-50/70 px-1.5 py-0.5 text-[8px] font-bold text-slate-600 uppercase tracking-wide">
                      <MessageCircle size={8} />
                      Direct
                    </span>
                  );
                }

                // Render strictly ONE intelligence badge following Information Priority
                let intelBadgeElement = null;
                switch (badgeType) {
                  case "HUMAN_REQUIRED":
                    intelBadgeElement = (
                      <span className="inline-flex items-center gap-0.5 rounded-full border border-rose-100 bg-rose-50 px-1.5 py-0.5 text-[8px] font-bold text-rose-600 uppercase tracking-wider">
                        <UserCheck size={9} />
                        Human Required
                      </span>
                    );
                    break;
                  case "HOT_OPPORTUNITY":
                    intelBadgeElement = (
                      <span className="inline-flex items-center gap-0.5 rounded-full border border-orange-100 bg-orange-50 px-1.5 py-0.5 text-[8px] font-bold text-orange-600 uppercase tracking-wider">
                        <Flame size={9} className="animate-pulse" />
                        Hot Opportunity
                      </span>
                    );
                    break;
                  case "NEEDS_ATTENTION":
                    intelBadgeElement = (
                      <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[8px] font-bold text-amber-600 uppercase tracking-wider">
                        <AlertCircle size={9} />
                        Needs Attention
                      </span>
                    );
                    break;
                  case "AI_HANDLING":
                    intelBadgeElement = (
                      <span className="inline-flex items-center gap-0.5 rounded-full border border-purple-100 bg-purple-50 px-1.5 py-0.5 text-[8px] font-bold text-purple-600 uppercase tracking-wider">
                        <Bot size={9} />
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
                      w-full text-left rounded-xl border transition-all duration-150 p-2.5 flex items-start gap-3 cursor-pointer
                      ${
                        isActive
                          ? "bg-blue-50/80 border-blue-200 shadow-sm"
                          : "bg-white/95 border-slate-200/60 hover:bg-slate-50/70 hover:border-slate-300/60"
                      }
                    `}
                  >
                    {/* Compact Avatar */}
                    <div className="relative shrink-0 mt-0.5">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-r ${avatarGradient} text-xs font-bold text-white shadow-inner`}>
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-500 shadow-sm" />
                    </div>

                    {/* Information priority content wrapper */}
                    <div className="flex-1 min-w-0">
                      {/* Name, Platform, Badges, & Revenue Tag */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold tracking-tight text-slate-900 truncate max-w-[120px] sm:max-w-[180px]">
                          {name}
                        </span>
                        
                        {platformBadge}
                        
                        {intelBadgeElement}

                        {/* Localized Revenue Opportunity (Show only for Hot Opportunity) */}
                        {badgeType === "HOT_OPPORTUNITY" && revenue && (
                          <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold text-emerald-600 uppercase tracking-wide shadow-sm">
                            <Flame size={8} className="text-emerald-500 fill-emerald-500/10" />
                            {formatRevenue(revenue)} Opportunity
                          </span>
                        )}
                      </div>

                      {/* Last message preview below metadata */}
                      <p className="text-[11px] text-slate-500 truncate mt-1 leading-normal">
                        {lastMessage}
                      </p>
                    </div>

                    {/* Timestamp & Unread count in the right corner */}
                    <div className="shrink-0 flex flex-col items-end gap-1.5 text-right mt-0.5">
                      {formattedTime && (
                        <span className="text-[10px] font-semibold text-slate-400">
                          {formattedTime}
                        </span>
                      )}

                      <div className="flex items-center gap-1.5">
                        {unreadCount > 0 && (
                          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-1 text-[8px] font-bold text-white shadow-sm">
                            {unreadCount}
                          </span>
                        )}
                        <ChevronRight size={11} className="text-slate-300 hover:text-slate-400" />
                      </div>
                    </div>
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
