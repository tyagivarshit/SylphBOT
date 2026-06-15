"use client";

import { useConversations, WorkspaceTab } from "./ConversationsContext";
import { AlertCircle, Activity, SlidersHorizontal, Sparkles, MessageSquare, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo } from "react";

export default function WorkspaceTabs() {
  const { activeTab, setActiveTab, filter, setFilter, leads, selectedLead, leadsIntelligence } = useConversations();

  // Map active state to our custom tab IDs: "attention" | "activity" | "all" | "ai" | "chat"
  const currentTabId = useMemo(() => {
    if (activeTab === "inbox") {
      if (filter === "attention") return "attention";
      return "all";
    }
    return activeTab;
  }, [activeTab, filter]);

  const handleTabClick = (tabId: string) => {
    if (tabId === "attention") {
      setActiveTab("inbox");
      setFilter("attention");
    } else if (tabId === "all") {
      setActiveTab("inbox");
      setFilter("all");
    } else {
      setActiveTab(tabId as any);
    }
  };

  // Calculate unread count for Attention vs All tabs
  const attentionUnread = useMemo(() => {
    return leads
      .filter((l) => {
        const intel = leadsIntelligence[l.id];
        return (
          intel?.recommendedBadge === "NEEDS_ATTENTION" ||
          intel?.recommendedBadge === "HUMAN_CONTROLLED" ||
          intel?.recommendedBadge === "HUMAN_REQUIRED"
        );
      })
      .reduce((sum, lead) => sum + (lead.unreadCount || 0), 0);
  }, [leads, leadsIntelligence]);

  const totalUnread = useMemo(() => {
    return leads.reduce((sum, lead) => sum + (lead.unreadCount || 0), 0);
  }, [leads]);

  const tabs: Array<{ id: string; label: string; mobileLabel: string; icon: LucideIcon; unreadCount?: number }> = [
    {
      id: "attention",
      label: "Needs Attention",
      mobileLabel: "Attention",
      icon: AlertCircle,
      unreadCount: attentionUnread,
    },
    {
      id: "activity",
      label: "AI Activity",
      mobileLabel: "Activity",
      icon: Activity,
    },
    {
      id: "all",
      label: "All Conversations",
      mobileLabel: "All",
      icon: SlidersHorizontal,
      unreadCount: totalUnread,
    },
    {
      id: "ai",
      label: "AI Desk",
      mobileLabel: "AI",
      icon: Sparkles,
    },
    {
      id: "chat",
      label: "Live Chat",
      mobileLabel: "Chat",
      icon: MessageSquare,
    },
  ];

  return (
    <div className="sticky top-0 z-30 w-full bg-slate-50/80 pb-2 backdrop-blur-md">
      <div className="flex w-full items-center justify-between border-b border-slate-200/80 px-2 py-3 sm:px-4">
        {/* Horizontal scrollable pills container */}
        <div className="flex w-full overflow-x-auto no-scrollbar sm:w-auto">
          <div className="flex items-center gap-1.5 rounded-2xl bg-slate-200/60 p-1 backdrop-blur-xl">
            {tabs.map((tab) => {
              const isActive = currentTabId === tab.id;
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className={`
                    relative flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold tracking-wide transition-all duration-200 ease-out focus:outline-none sm:text-sm
                    ${isActive ? "text-blue-600" : "text-slate-500 hover:text-slate-800"}
                  `}
                >
                  {/* Sliding active background indicator */}
                  {isActive && (
                    <motion.div
                      layoutId="activeWorkspaceTab"
                      className="absolute inset-0 rounded-xl bg-white shadow-sm border border-slate-200/10"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}

                  <span className="relative z-10 flex items-center gap-2 whitespace-nowrap">
                    <Icon size={14} className={isActive ? "text-blue-600" : "text-slate-400"} />
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="inline sm:hidden">{tab.mobileLabel}</span>

                    {/* Unread indicator for tab */}
                    {tab.unreadCount !== undefined && tab.unreadCount > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-bold text-white">
                        {tab.unreadCount}
                      </span>
                    )}

                    {/* Quick indicator for Active Chat selection status */}
                    {tab.id === "chat" && selectedLead && (
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Lead status pill on the right side for desktop */}
        {selectedLead && (
          <div className="hidden items-center gap-2 rounded-full border border-blue-100 bg-blue-50/50 px-3 py-1.5 text-xs font-medium text-slate-700 sm:flex">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-slate-500">Active Session:</span>
            <span className="font-semibold text-slate-800">
              {selectedLead.name || selectedLead.phone || "Instagram User"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
