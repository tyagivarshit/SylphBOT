"use client";

import { Suspense, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useSearchParams } from "next/navigation";
import ChatSidebar from "@/components/conversations/ChatSidebar";
import ChatWindow from "@/components/conversations/ChatWindow";
import { buildApiUrl, getAbsoluteApiOrigin } from "@/lib/url";

export interface Lead {
  id: string;
  name?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
}

export interface Message {
  id: string;
  content: string;
  sender: "USER" | "AI";
  createdAt: string;
}

function ConversationsPageContent() {
  const searchParams = useSearchParams();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMobileView, setIsMobileView] = useState(false);
  const leadIdFromQuery = searchParams.get("leadId");

  /* ================= MOBILE DETECT ================= */
  useEffect(() => {
    const check = () => {
      setIsMobileView(window.innerWidth < 768);
    };

    check();
    window.addEventListener("resize", check);

    return () => window.removeEventListener("resize", check);
  }, []);

  /* ================= FETCH CONVERSATIONS ================= */
  useEffect(() => {
    const fetchLeads = async () => {
      try {
        const res = await fetch(buildApiUrl("/conversations"), {
          credentials: "include",
        });

        const data = await res.json();

        console.log("🔥 conversations API:", data);

        setLeads(data.conversations || []);
      } catch (err) {
        console.error(err);
        setLeads([]);
      }
    };

    fetchLeads();
  }, []);

  /* ================= FETCH MESSAGES ================= */
  useEffect(() => {
    if (!selectedLead) return;

    const fetchMessages = async () => {
      try {
        const res = await fetch(
          buildApiUrl(`/conversations/${selectedLead.id}/messages`),
          {
            credentials: "include",
          }
        );

        const data = await res.json();

        console.log("🔥 messages API:", data);

        setMessages(data.messages || []);
      } catch (err) {
        console.error(err);
        setMessages([]);
      }
    };

    fetchMessages();
  }, [selectedLead]);

  useEffect(() => {
    if (!leadIdFromQuery || leads.length === 0) return;

    const matchedLead = leads.find((lead) => lead.id === leadIdFromQuery);

    if (matchedLead) {
      setSelectedLead(matchedLead);
    }
  }, [leadIdFromQuery, leads]);

  /* ================= SOCKET ================= */
  useEffect(() => {
    if (!selectedLead) return;

    const socket = io(getAbsoluteApiOrigin(), {
      transports: ["websocket"],
      withCredentials: true,
    });

    socket.emit("join_conversation", selectedLead.id);

    socket.on("new_message", (msg: Message) => {
      setMessages((prev) => [...prev, msg]);

      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === selectedLead.id
            ? {
                ...lead,
                lastMessage: msg.content,
                lastMessageTime: msg.createdAt,
                unreadCount: 0,
              }
            : lead
        )
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [selectedLead]);

  /* ================= MOBILE BACK ================= */
  const handleBack = () => {
    setSelectedLead(null);
  };

  return (
    <div className="h-[calc(100vh-64px)] flex bg-gradient-to-br from-white via-blue-50 to-cyan-50">

      {/* WRAPPER CARD */}
      <div className="flex w-full bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl overflow-hidden shadow-sm">

        <ChatSidebar
          leads={leads}
          selectedLead={selectedLead}
          setSelectedLead={setSelectedLead}
        />

        <ChatWindow
          selectedLead={selectedLead}
          messages={messages}
          setMessages={setMessages}
          onBack={isMobileView ? handleBack : undefined}
        />

      </div>

    </div>
  );
}

function ConversationsPageFallback() {
  return (
    <div className="h-[calc(100vh-64px)] flex items-center justify-center bg-gradient-to-br from-white via-blue-50 to-cyan-50">
      <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );
}

export default function ConversationsPage() {
  return (
    <Suspense fallback={<ConversationsPageFallback />}>
      <ConversationsPageContent />
    </Suspense>
  );
}
