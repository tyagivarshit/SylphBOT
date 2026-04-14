"use client";

import { buildApiUrl } from "@/lib/url";
import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";

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
  unreadCount?: number;
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
  const [openingUnreadCount, setOpeningUnreadCount] = useState(0);
  const [unreadAnchorId, setUnreadAnchorId] = useState<string | null>(null);

  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const unreadMarkerRef = useRef<HTMLDivElement>(null);
  const initialPositionedRef = useRef(false);
  const previousMessageCountRef = useRef(0);

  /* ================= AUTO SCROLL ================= */
  useEffect(() => {
    initialPositionedRef.current = false;
    previousMessageCountRef.current = 0;
    setOpeningUnreadCount(selectedLead?.unreadCount || 0);
    setUnreadAnchorId(null);
  }, [selectedLead?.id, selectedLead?.unreadCount]);

  useEffect(() => {
    if (!selectedLead || !messages.length || unreadAnchorId || openingUnreadCount <= 0) {
      return;
    }

    const safeUnreadCount = Math.min(openingUnreadCount, messages.length);
    const anchorMessage = messages[messages.length - safeUnreadCount];

    setUnreadAnchorId(anchorMessage?.id || null);
  }, [messages, openingUnreadCount, selectedLead, unreadAnchorId]);

  useEffect(() => {
    if (!selectedLead) {
      previousMessageCountRef.current = 0;
      return;
    }

    if (!messages.length) {
      previousMessageCountRef.current = 0;
      return;
    }

    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    if (!initialPositionedRef.current && openingUnreadCount > 0 && !unreadAnchorId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (!initialPositionedRef.current) {
        if (unreadAnchorId && unreadMarkerRef.current) {
          const targetTop = Math.max(
            unreadMarkerRef.current.offsetTop - viewport.clientHeight * 0.16,
            0
          );

          viewport.scrollTo({
            top: targetTop,
            behavior: "auto",
          });
        } else {
          viewport.scrollTo({
            top: viewport.scrollHeight,
            behavior: "auto",
          });
        }

        initialPositionedRef.current = true;
      } else if (messages.length > previousMessageCountRef.current) {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: "smooth",
        });
      }

      previousMessageCountRef.current = messages.length;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages, openingUnreadCount, selectedLead, unreadAnchorId]);

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
        buildApiUrl(`/conversations/${selectedLead.id}/messages`),
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: msg,
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

    await fetch(buildApiUrl("/booking/start"), {
      method: "POST",
      credentials: "include",
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
      const res = await fetch(buildApiUrl("/services/options"), {
        credentials: "include",
      });
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
      <div className="hidden flex-1 items-center justify-center bg-white/35 text-sm text-slate-500 md:flex">
        Select a conversation
      </div>
    );
  }

  const contactName = selectedLead.name || "User";
  const contactInitial = contactName.charAt(0).toUpperCase();
  const unreadLabel =
    openingUnreadCount > 0
      ? `${openingUnreadCount} new ${
          openingUnreadCount === 1 ? "message" : "messages"
        }`
      : "Live conversation";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(239,245,255,0.6),rgba(248,251,255,0.96))]">

      {/* HEADER */}
      <div className="flex min-h-[72px] items-center gap-3 border-b border-slate-200/80 bg-white/88 px-4 py-3 backdrop-blur-xl md:px-5">
        <button
          onClick={onBack}
          className="text-slate-600 transition hover:text-slate-900 md:hidden"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 text-sm font-semibold text-white shadow-sm">
          {contactInitial}
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {contactName}
          </p>
          <p className="text-xs text-slate-500">{unreadLabel}</p>
        </div>
      </div>

      {/* MESSAGES */}
      <div
        ref={scrollViewportRef}
        className="brand-scrollbar flex-1 overflow-y-auto px-3 py-4 md:px-5 md:py-5"
      >
        <div className="flex min-h-full flex-col justify-end gap-2.5">
          {(messages || []).length === 0 ? (
            <div className="mx-auto rounded-3xl border border-slate-200/80 bg-white/88 px-4 py-3 text-center shadow-sm">
              <p className="text-sm font-medium text-slate-800">
                No messages yet
              </p>
              <p className="mt-1 text-xs text-slate-500">
                New replies will appear here.
              </p>
            </div>
          ) : (
            (messages || []).map((msg) => {
              const isUser = msg.sender === "USER";

              return (
                <Fragment key={msg.id}>
                  {msg.id === unreadAnchorId && openingUnreadCount > 0 && (
                    <div ref={unreadMarkerRef} className="py-1">
                      <div className="mx-auto w-fit rounded-full border border-blue-200 bg-white/92 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-700 shadow-sm">
                        {unreadLabel}
                      </div>
                    </div>
                  )}

                  <div
                    className={`flex ${
                      isUser ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[86%] rounded-[22px] px-4 py-3 text-sm leading-5 shadow-sm md:max-w-[72%] ${
                        isUser
                          ? "rounded-br-md bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 text-white"
                          : "rounded-bl-md border border-slate-200/90 bg-white/88 text-slate-900 backdrop-blur"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">
                        {msg.content}
                      </p>

                      {/* CTA */}
                      {msg.sender === "AI" && msg.cta && msg.cta !== "NONE" && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {msg.cta === "BOOK_NOW" && (
                            <button
                              onClick={handleBooking}
                              className="rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                            >
                              Book Now
                            </button>
                          )}

                          {msg.cta === "SHOW_OPTIONS" && (
                            <button
                              onClick={handleOptions}
                              className="rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-100"
                            >
                              View Options
                            </button>
                          )}
                        </div>
                      )}

                      {/* TIME */}
                      <p
                        className={`mt-1.5 text-right text-[10px] ${
                          isUser ? "text-white/70" : "text-slate-400"
                        }`}
                      >
                        {new Date(msg.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </Fragment>
              );
            })
          )}
        </div>
      </div>

      {/* INPUT */}
      <div className="border-t border-slate-200/80 bg-white/88 px-3 py-3 backdrop-blur-xl md:px-5">
        <div className="brand-input-shell gap-2 pl-4 pr-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value || "")}
            placeholder="Type a message"
            className="min-w-0 bg-transparent text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
          />

          <button
            onClick={sendMessage}
            disabled={sending}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 text-white shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

    </div>
  );
}
