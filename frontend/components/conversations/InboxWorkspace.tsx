"use client";

import { useConversations, Lead } from "./ConversationsContext";
import { Search, MessageCircle, Instagram } from "lucide-react";
import { EmptyState, RetryState, SkeletonCard } from "@/components/ui/feedback";

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

    // Check if today
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    // Check if yesterday
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }

    // Else return short month/day
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
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
    filteredLeads,
    setActiveTab,
  } = useConversations();

  const handleSelectLead = (lead: Lead) => {
    setSelectedLead(lead);
    setActiveTab("chat");
  };

  return (
    <div className="flex h-full w-full flex-col bg-white/40 backdrop-blur-xl">
      {/* Top Search & Action Bar */}
      <div className="border-b border-slate-200/80 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            Inbox Channels
          </h2>
          <p className="text-xs text-slate-500 sm:text-sm">
            Search, discover, and filter all customer conversations.
          </p>
        </div>

        {/* Search input with improved styling */}
        <div className="relative w-full md:max-w-md">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Search contacts, phone numbers or IG handles..."
            value={search}
            onChange={(e) => setSearch(e.target.value || "")}
            className="w-full rounded-2xl border border-slate-200 bg-white/70 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-blue-400/35 focus:border-blue-400/80"
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto brand-scrollbar p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-4xl w-full">
          
          {/* Loading Skeletons */}
          {leadsLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <SkeletonCard key={index} className="h-20 sm:h-24 w-full rounded-2xl" />
              ))}
            </div>
          ) : null}

          {/* Error State */}
          {!leadsLoading && leadsError ? (
            <div className="py-8">
              <RetryState
                title="Failed to load inbox"
                description={leadsError}
                onRetry={() => void fetchLeads()}
              />
            </div>
          ) : null}

          {/* Empty State (No Integrations/Conversations) */}
          {!leadsLoading && !leadsError && leads.length === 0 ? (
            <div className="mx-auto max-w-xl py-12">
              <EmptyState
                title="No conversations yet"
                description="Connect Instagram or WhatsApp to begin receiving messages."
                actionLabel="Connect Channels →"
                actionHref="/integrations"
              />
            </div>
          ) : null}

          {/* No Search Matches */}
          {!leadsLoading && !leadsError && leads.length > 0 && filteredLeads.length === 0 ? (
            <div className="mx-auto max-w-xl py-12">
              <EmptyState
                title="No matches found"
                description={`No conversations matched your search query "${search}".`}
                actionLabel="Clear Search"
                onAction={() => setSearch("")}
              />
            </div>
          ) : null}

          {/* Conversation List */}
          {!leadsLoading && !leadsError && filteredLeads.length > 0 ? (
            <div className="space-y-3">
              {filteredLeads.map((lead) => {
                const isActive = selectedLead?.id === lead.id;
                const name = getLeadDisplayName(lead);
                const platform = (lead?.platform || "").toUpperCase();
                const lastMessage = lead?.lastMessage || "Waiting for the first message";
                const unreadCount = lead?.unreadCount || 0;
                const formattedTime = formatLeadTime(lead?.lastMessageTime);

                // Setup platform badges and avatar styles dynamically
                let avatarGradient = "from-blue-600 to-cyan-500";
                let badgeElement = null;

                if (platform === "WHATSAPP") {
                  avatarGradient = "from-emerald-500 to-green-600";
                  badgeElement = (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                      <WhatsAppIcon className="h-3 w-3" />
                      WhatsApp
                    </span>
                  );
                } else if (platform === "INSTAGRAM") {
                  avatarGradient = "from-purple-600 via-pink-500 to-orange-400";
                  badgeElement = (
                    <span className="inline-flex items-center gap-1 rounded-full border border-pink-100 bg-pink-50 px-2 py-0.5 text-[10px] font-semibold text-pink-600">
                      <Instagram size={11} />
                      Instagram
                    </span>
                  );
                } else {
                  badgeElement = (
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      <MessageCircle size={11} />
                      Direct
                    </span>
                  );
                }

                return (
                  <button
                    key={lead.id}
                    onClick={() => handleSelectLead(lead)}
                    className={`
                      w-full text-left rounded-2xl border transition-all duration-200 p-4 sm:p-5 flex items-center justify-between gap-4 cursor-pointer
                      ${
                        isActive
                          ? "bg-blue-50/70 border-blue-200 shadow-sm shadow-blue-100/50"
                          : "bg-white/90 border-slate-200/60 hover:bg-slate-50/80 hover:border-slate-300/60 hover:shadow-sm"
                      }
                    `}
                  >
                    {/* Left: Avatar & Text */}
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      {/* Avatar */}
                      <div className="relative flex-shrink-0">
                        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-r ${avatarGradient} text-sm font-bold text-white shadow-inner`}>
                          {name.charAt(0).toUpperCase()}
                        </div>
                        {/* Active online dot */}
                        <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-green-500" />
                      </div>

                      {/* Name, Platform Badge, and Message Preview */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold tracking-tight text-slate-900 truncate max-w-[150px] sm:max-w-xs">
                            {name}
                          </p>
                          {badgeElement}
                        </div>
                        
                        <p className="mt-1.5 text-xs text-slate-500 truncate max-w-sm sm:max-w-xl">
                          {lastMessage}
                        </p>
                      </div>
                    </div>

                    {/* Right: Timestamp & Unread count */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {formattedTime && (
                        <span className="text-[11px] font-medium text-slate-400">
                          {formattedTime}
                        </span>
                      )}

                      {unreadCount > 0 ? (
                        <span className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                          {unreadCount}
                        </span>
                      ) : null}
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
