"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import ChatSidebar from "@/components/conversations/ChatSidebar";
import ChatWindow from "@/components/conversations/ChatWindow";

const API = process.env.NEXT_PUBLIC_API_URL || "";

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

export default function ConversationsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMobileView, setIsMobileView] = useState(false);

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
        const res = await fetch(`${API}/api/conversations`, {
          credentials: "include", // 🔥 MOST IMPORTANT FIX
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
          `${API}/api/conversations/${selectedLead.id}/messages`,
          {
            credentials: "include", // 🔥 IMPORTANT
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

  /* ================= SOCKET ================= */
  useEffect(() => {
    if (!selectedLead) return;

    const socket = io(API, {
      transports: ["websocket"],
      withCredentials: true, // 🔥 IMPORTANT FOR COOKIE AUTH
    });

    socket.emit("join", `lead_${selectedLead.id}`);

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
    <div className="h-[calc(100vh-64px)] flex bg-[#f9fcff]">
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
  );
}