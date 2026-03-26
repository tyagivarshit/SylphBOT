"use client";

import { Lead } from "@/app/(dashboard)/conversations/page";
import { Search } from "lucide-react";
import { useState } from "react";

interface Props {
  leads: Lead[];
  selectedLead: Lead | null;
  setSelectedLead: (lead: Lead) => void;
}

export default function ChatSidebar({
  leads,
  selectedLead,
  setSelectedLead,
}: Props) {
  const [search, setSearch] = useState("");

  const filteredLeads = leads.filter((lead) =>
    lead.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={`
      ${selectedLead ? "hidden md:flex" : "flex"}
      w-full md:w-[300px]
      flex-col
      border-r border-gray-200
      bg-white
    `}>

      {/* 🔥 HEADER */}
      <div className="p-4 border-b border-gray-200">

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
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-100 rounded-full outline-none focus:ring-2 focus:ring-[#14E1C1]"
          />
        </div>
      </div>

      {/* 🔥 LIST */}
      <div className="flex-1 overflow-y-auto">

        {filteredLeads.length === 0 && (
          <p className="text-sm text-gray-500 p-4">
            No conversations
          </p>
        )}

        {filteredLeads.map((lead) => {
          const isActive = selectedLead?.id === lead.id;

          return (
            <button
              key={lead.id}
              onClick={() => setSelectedLead(lead)}
              className={`
                w-full text-left px-4 py-3
                flex items-center gap-3
                transition
                ${isActive ? "bg-[#f0fdfa]" : "hover:bg-gray-50"}
              `}
            >

              {/* AVATAR */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] flex items-center justify-center text-white text-sm font-semibold">
                {lead.name?.charAt(0)?.toUpperCase() || "U"}
              </div>

              {/* INFO */}
              <div className="flex-1">

                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium text-gray-900">
                    {lead.name || "Unknown"}
                  </p>

                  {/* ONLINE DOT */}
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                </div>

                <p className="text-xs text-gray-500 truncate">
                  Tap to chat
                </p>
              </div>

            </button>
          );
        })}
      </div>
    </div>
  );
}