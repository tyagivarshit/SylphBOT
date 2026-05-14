"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Lead } from "@/app/(dashboard)/conversations/page";
import { useDebounce } from "@/hooks/useDebounce";
import {
  EmptyState,
  RetryState,
  SkeletonCard,
  TrustSignals,
} from "@/components/ui/feedback";

interface Props {
  leads: Lead[];
  selectedLead: Lead | null;
  setSelectedLead: (lead: Lead) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

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

export default function ChatSidebar({
  leads,
  selectedLead,
  setSelectedLead,
  loading = false,
  error = null,
  onRetry,
}: Props) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 180);

  const filteredLeads = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();

    if (!query) {
      return leads;
    }

    return leads.filter((lead) =>
      getLeadDisplayName(lead).toLowerCase().includes(query)
    );
  }, [debouncedSearch, leads]);

  return (
    <div
      className={`
      ${selectedLead ? "hidden md:flex" : "flex"}
      w-full md:w-[340px]
      min-h-0
      flex-col
      overflow-hidden
      border-r border-blue-100
      bg-white/80 backdrop-blur-xl
    `}
    >
      <div className="border-b border-blue-100 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Conversations
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Search, triage, and reply without losing context.
            </p>
          </div>

          <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
            {leads.length}
          </span>
        </div>

        <TrustSignals className="mt-3" />

        <div className="relative mt-3">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />

          <input
            type="text"
            placeholder="Search conversations"
            value={search}
            onChange={(e) => setSearch(e.target.value || "")}
            className="w-full rounded-xl border border-blue-100 bg-white/70 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonCard key={index} className="h-20" />
            ))}
          </div>
        ) : null}

        {!loading && error && onRetry ? (
          <div className="p-4">
            <RetryState
              title="Conversations unavailable"
              description={error}
              onRetry={onRetry}
            />
          </div>
        ) : null}

        {!loading && !error && leads.length === 0 ? (
          <div className="p-4">
            <EmptyState
              eyebrow="Inbox"
              title="No conversations yet"
              description="Connect Instagram or WhatsApp, then launch your first automation so replies and conversations start appearing here."
              actionLabel="Create your first automation"
              actionHref="/automation"
            />
          </div>
        ) : null}

        {!loading && !error && leads.length > 0 && filteredLeads.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No matches for this search"
              description="Try a name, phone number, or Instagram handle to find the conversation faster."
            />
          </div>
        ) : null}

        {!loading && !error && filteredLeads.length > 0
          ? filteredLeads.map((lead) => {
              const isActive = selectedLead?.id === lead?.id;
              const name = getLeadDisplayName(lead);
              const lastMessage = lead?.lastMessage || "Waiting for the first message";
              const unreadCount = lead?.unreadCount || 0;

              return (
                <button
                  key={lead?.id}
                  onClick={() => lead && setSelectedLead(lead)}
                  className={`
                    w-full border-b border-blue-50 px-4 py-3 text-left transition
                    ${isActive ? "bg-blue-50" : "hover:bg-blue-50/60"}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-sm font-semibold text-white">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-400" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {name}
                        </p>

                        {lead?.lastMessageTime ? (
                          <span className="whitespace-nowrap text-[10px] text-gray-400">
                            {new Date(lead.lastMessageTime).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1 flex items-center justify-between gap-3">
                        <p className="truncate text-xs text-gray-500">
                          {lastMessage}
                        </p>

                        {unreadCount > 0 ? (
                          <span className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-2 py-[2px] text-[10px] font-semibold text-white">
                            {unreadCount}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          : null}
      </div>

      <div className="border-t border-blue-100 px-4 py-3 text-xs text-slate-500">
        Need more leads? <Link href="/automation" className="font-semibold text-blue-600">Create an automation</Link> and keep replies running automatically.
      </div>
    </div>
  );
}
