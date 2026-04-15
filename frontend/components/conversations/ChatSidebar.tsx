"use client";

import { Lead } from "@/app/(dashboard)/conversations/page";
import { Search } from "lucide-react";
import { useState } from "react";

interface Props {
  leads: Lead[];
  selectedLead: Lead | null;
  setSelectedLead: (lead: Lead) => void;
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
}: Props) {
  const [search, setSearch] = useState("");

  const filteredLeads = (leads || []).filter((lead) =>
    getLeadDisplayName(lead)
      .toLowerCase()
      .includes((search || "").toLowerCase())
  );

  return (
    <div
      className={`
      ${selectedLead ? "hidden md:flex" : "flex"}
      w-full md:w-[320px]
      min-h-0
      flex-col
      overflow-hidden
      border-r border-blue-100
      bg-white/80 backdrop-blur-xl
    `}
    >
      {/* 🔥 HEADER */}
      <div className="p-4 border-b border-blue-100">
        <h2 className="text-base font-semibold text-gray-900">
          Messages
        </h2>

        {/* SEARCH */}
        <div className="mt-3 relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />

          <input
            type="text"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value || "")}
            className="w-full pl-9 pr-3 py-2.5 text-sm bg-white/70 border border-blue-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>

      {/* 🔥 LIST */}
      <div className="flex-1 overflow-y-auto">

        {filteredLeads.length === 0 && (
          <p className="text-sm text-gray-500 p-4 text-center">
            No conversations
          </p>
        )}

        {filteredLeads.map((lead) => {
          const isActive = selectedLead?.id === lead?.id;

          const name = getLeadDisplayName(lead);
          const lastMessage = lead?.lastMessage || "Start conversation";
          const unreadCount = lead?.unreadCount || 0;

          return (
            <button
              key={lead?.id}
              onClick={() => lead && setSelectedLead(lead)}
              className={`
                w-full text-left px-4 py-3
                flex items-center gap-3
                transition
                border-b border-blue-50
                ${isActive ? "bg-blue-50" : "hover:bg-blue-50/60"}
              `}
            >
              {/* AVATAR */}
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 flex items-center justify-center text-white text-sm font-semibold">
                  {name.charAt(0).toUpperCase()}
                </div>

                {/* ONLINE DOT */}
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 border-2 border-white rounded-full" />
              </div>

              {/* INFO */}
              <div className="flex-1 min-w-0">
                {/* NAME + TIME */}
                <div className="flex justify-between items-center">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {name}
                  </p>

                  {lead?.lastMessageTime && (
                    <span className="text-[10px] text-gray-400 whitespace-nowrap">
                      {new Date(lead.lastMessageTime).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>

                {/* LAST MESSAGE + UNREAD */}
                <div className="flex justify-between items-center mt-1">
                  <p className="text-xs text-gray-500 truncate max-w-[180px]">
                    {lastMessage}
                  </p>

                  {unreadCount > 0 && (
                    <span className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-[10px] px-2 py-[2px] rounded-full font-semibold">
                      {unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
