"use client";

import { useEffect, useRef, useState } from "react";
import { Send, ArrowLeft } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "";

interface Message {
  id: string;
  content: string;
  sender: "USER" | "AI";
  createdAt: string;
  cta?: string;
}

interface Lead {
  id: string;
  name?: string;
}

interface Props {
  selectedLead: Lead | null;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  onBack?: () => void;
}

export default function ChatWindow({
  selectedLead,
  messages,
  setMessages,
  onBack,
}: Props) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  /* ================= AUTO SCROLL ================= */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ================= SEND MESSAGE ================= */
  const sendMessage = async () => {
    if (!input.trim() || !selectedLead || sending) return;

    const msg = input.trim();
    setInput("");

    const tempMessage: Message = {
      id: "temp-" + Date.now(),
      content: msg,
      sender: "USER",
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMessage]);
    setSending(true);

    try {
      await fetch(
        `${API}/api/conversations/${selectedLead.id}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: msg, // ✅ FIX
            sender: "USER",
          }),
        }
      );
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  /* ================= CTA ================= */

  const handleBooking = async () => {
    if (!selectedLead) return;

    await fetch(`${API}/api/booking/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        leadId: selectedLead.id,
      }),
    });
  };

  const handleOptions = async () => {
    try {
      const res = await fetch(`${API}/api/services/options`);
      const data = await res.json();

      const msg: Message = {
        id: Date.now().toString(),
        content:
          data?.message || "Here are some options I can suggest 👍",
        sender: "AI",
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, msg]);
    } catch {}
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
      {/* HEADER */}
      <div className="h-[60px] border-b border-gray-200 flex items-center px-4 bg-white gap-3">
        <button onClick={onBack} className="md:hidden text-gray-700">
          <ArrowLeft size={18} />
        </button>

        <div>
          <p className="text-sm font-semibold text-gray-900">
            {selectedLead.name || "User"}
          </p>
          <p className="text-xs text-green-500">Online</p>
        </div>
      </div>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-3">
        {(messages || []).map((msg) => {
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

                {/* CTA */}
                {msg.sender === "AI" && msg.cta && msg.cta !== "NONE" && (
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {msg.cta === "BOOK_NOW" && (
                      <button
                        onClick={handleBooking}
                        className="bg-green-600 text-white px-3 py-1 rounded-lg text-xs"
                      >
                        Book Now
                      </button>
                    )}

                    {msg.cta === "SHOW_OPTIONS" && (
                      <button
                        onClick={handleOptions}
                        className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs"
                      >
                        View Options
                      </button>
                    )}
                  </div>
                )}

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

        <div ref={bottomRef} />
      </div>

      {/* INPUT */}
      <div className="border-t border-gray-200 bg-white p-3 md:p-4">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value || "")}
            placeholder="Message..."
            className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[#14E1C1]"
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
          />

          <button
            onClick={sendMessage}
            disabled={sending}
            className="bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] text-white p-2 rounded-full disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}