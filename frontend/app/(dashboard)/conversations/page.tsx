"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import ChatSidebar from "@/components/conversations/ChatSidebar"; 
import ChatWindow from "@/components/conversations/ChatWindow";

const API = process.env.NEXT_PUBLIC_API_URL || "";

export interface Lead {
  id: string;
  name?: string;
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

  /* ================= FETCH LEADS ================= */
  useEffect(() => {
    const fetchLeads = async () => {
      try {
        const res = await fetch(`${API}/api/leads`);
        const data = await res.json();
        setLeads(data.leads || []);
      } catch {
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
          `${API}/api/messages/${selectedLead.id}`
        );
        const data = await res.json();
        setMessages(data.messages || []);
      } catch {
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
    });

    socket.emit("join", selectedLead.id);

    socket.on("new_message", (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
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

      {/* 🔥 SIDEBAR */}
      <ChatSidebar
        leads={leads}
        selectedLead={selectedLead}
        setSelectedLead={setSelectedLead}
      />

      {/* 🔥 CHAT WINDOW */}
      <ChatWindow
        selectedLead={selectedLead}
        messages={messages}
        setMessages={setMessages}
        onBack={isMobileView ? handleBack : undefined}
      />
    </div>
  );
}