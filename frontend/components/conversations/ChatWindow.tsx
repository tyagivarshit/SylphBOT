"use client";

import { Message, Lead } from "@/app/(dashboard)/conversations/page";
import { useEffect, useRef, useState } from "react";
import { Send, ArrowLeft } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "";

interface Props {
  selectedLead: Lead | null;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  onBack?: () => void; // 🔥 mobile ke liye
}

export default function ChatWindow({
  selectedLead,
  messages,
  setMessages,
  onBack,
}: Props) {
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  /* ================= AUTO SCROLL ================= */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  /* ================= SEND MESSAGE ================= */
  const sendMessage = async () => {
    if (!input.trim() || !selectedLead) return;

    const msg = input;

    const tempMessage: Message = {
      id: Date.now().toString(),
      content: msg,
      sender: "USER",
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMessage]);
    setInput("");
    setTyping(true);

    try {
      await fetch(`${API}/api/messages/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leadId: selectedLead.id,
          message: msg,
        }),
      });
    } catch (err) {
      console.error(err);
    } finally {
      setTyping(false);
    }
  };

  /* ================= EMPTY ================= */
  if (!selectedLead) {
    return (
      <div className="flex-1 hidden md:flex items-center justify-center text-gray-500">
        Select a conversation
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#f9fcff] h-full">

      {/* 🔥 HEADER */}
      <div className="h-[60px] border-b border-gray-200 flex items-center px-4 bg-white gap-3">

        {/* 🔥 MOBILE BACK */}
        <button
          onClick={onBack}
          className="md:hidden text-gray-700"
        >
          <ArrowLeft size={18} />
        </button>

        <div>
          <p className="text-sm font-semibold text-gray-900">
            {selectedLead.name || "User"}
          </p>
          <p className="text-xs text-green-500">Online</p>
        </div>
      </div>

      {/* 🔥 MESSAGES */}
      <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-3">

        {messages.map((msg) => {
          const isUser = msg.sender === "USER";

          return (
            <div
              key={msg.id}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] md:max-w-[70%] px-4 py-2 text-sm rounded-2xl
                ${
                  isUser
                    ? "bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] text-white"
                    : "bg-white border border-gray-200 text-gray-900"
                }`}
              >
                <p>{msg.content}</p>

                {/* TIME */}
                <p className="text-[10px] mt-1 opacity-70 text-right">
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}

        {/* 🔥 TYPING INDICATOR */}
        {typing && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 px-4 py-2 rounded-xl text-sm text-gray-500 animate-pulse">
              typing...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 🔥 INPUT (INSTAGRAM STYLE MOBILE) */}
      <div className="border-t border-gray-200 bg-white p-3 md:p-4">

        <div className="flex items-center gap-2">

          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message..."
            className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[#14E1C1]"
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
          />

          <button
            onClick={sendMessage}
            className="bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] text-white p-2 rounded-full"
          >
            <Send size={16} />
          </button>

        </div>
      </div>
    </div>
  );
}