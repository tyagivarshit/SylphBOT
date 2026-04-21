"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  LifeBuoy,
  Mail,
  SendHorizonal,
  ShieldCheck,
} from "lucide-react";
import { buildApiUrl } from "@/lib/url";
import { LoadingSpinner, TrustSignals } from "@/components/ui/feedback";

type ChatRole = "assistant" | "user";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: number;
};

const SUPPORT_EMAIL = "support@automexiaai.in";
const BACKEND_FALLBACK_REPLY =
  "I'm not sure about that. Please contact our support team.";
const QUICK_QUESTIONS = [
  "AI credits",
  "Automation",
  "Billing",
  "Connect Instagram",
  "WhatsApp setup",
] as const;
const WELCOME_MESSAGE =
  "Hi, I can help with AI credits, automation, billing, Instagram setup, and WhatsApp setup.";
const MIN_TYPING_MS = 350;

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

const createMessage = (
  role: ChatRole,
  text: string,
  createdAt = Date.now()
): ChatMessage => ({
  id: `${role}-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
  role,
  text,
  createdAt,
});

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const isFallbackReply = (text: string) =>
  text.trim() === BACKEND_FALLBACK_REPLY;

const formatAssistantReply = (text: string) =>
  isFallbackReply(text)
    ? `${BACKEND_FALLBACK_REPLY} at ${SUPPORT_EMAIL}`
    : text;

function MessageText({ text }: { text: string }) {
  const parts = text.split(SUPPORT_EMAIL);

  return (
    <>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {part}
          {index < parts.length - 1 ? (
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-semibold text-blue-600 hover:text-blue-700"
            >
              {SUPPORT_EMAIL}
            </a>
          ) : null}
        </span>
      ))}
    </>
  );
}

export default function HelpSupportPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    createMessage("assistant", WELCOME_MESSAGE, Date.now() - 60_000),
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, loading]);

  const suggestionButtons = useMemo(
    () =>
      QUICK_QUESTIONS.filter(
        (suggestion) =>
          !messages.some(
            (message) =>
              message.role === "user" &&
              message.text.toLowerCase() === suggestion.toLowerCase()
          )
      ),
    [messages]
  );

  const sendMessage = async (messageOverride?: string) => {
    const question = String(messageOverride ?? input).trim();

    if (!question || loading) {
      return;
    }

    setMessages((current) => [...current, createMessage("user", question)]);
    setInput("");
    setLoading(true);

    const startedAt = Date.now();
    let reply = BACKEND_FALLBACK_REPLY;

    try {
      const response = await fetch(buildApiUrl("/api/help-ai"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: question,
        }),
      });

      const data = await response.json().catch(() => null);

      if (response.ok && typeof data?.reply === "string" && data.reply.trim()) {
        reply = data.reply.trim();
      }
    } catch {
      reply = BACKEND_FALLBACK_REPLY;
    }

    const elapsed = Date.now() - startedAt;

    if (elapsed < MIN_TYPING_MS) {
      await sleep(MIN_TYPING_MS - elapsed);
    }

    setMessages((current) => [...current, createMessage("assistant", reply)]);
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="brand-info-strip rounded-[26px] p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Help and support
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              Safe help assistant
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-500">
              Ask short product questions and get controlled answers from the
              Automexia help knowledge base only.
            </p>
            <TrustSignals />
          </div>

          <div className="rounded-[22px] border border-slate-200/80 bg-white/88 px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Need a human?
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              <Mail size={15} />
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="brand-section-shell flex min-h-[38rem] flex-col rounded-[30px] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200/70 pb-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                <Bot size={14} />
                Knowledge-only answers
              </div>
              <h2 className="mt-3 text-lg font-semibold text-slate-950">
                Chat with help
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                The assistant answers only from predefined support knowledge.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {suggestionButtons.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  void sendMessage(suggestion);
                }}
                disabled={loading}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div className="mt-4 flex-1 overflow-hidden rounded-[24px] border border-slate-200/80 bg-slate-50/70">
            <div className="brand-scrollbar flex h-full flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-5">
              {messages.map((message) => {
                const isAssistant = message.role === "assistant";
                const displayText = isAssistant
                  ? formatAssistantReply(message.text)
                  : message.text;

                return (
                  <div
                    key={message.id}
                    className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-[22px] px-4 py-3 shadow-sm ${
                        isAssistant
                          ? "border border-slate-200/80 bg-white text-slate-700"
                          : "bg-[linear-gradient(135deg,#081223_0%,#0b2a5b_55%,#1e5eff_100%)] text-white"
                      }`}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
                        {isAssistant ? "Automexia Help" : "You"}
                      </p>
                      <p className="mt-2 text-sm leading-6">
                        <MessageText text={displayText} />
                      </p>
                      <p
                        className={`mt-2 text-[11px] ${
                          isAssistant ? "text-slate-400" : "text-white/70"
                        }`}
                      >
                        {timeFormatter.format(message.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}

              {loading ? (
                <div className="flex justify-start">
                  <div className="rounded-[22px] border border-slate-200/80 bg-white px-4 py-3 text-slate-600 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Automexia Help
                    </p>
                    <div className="mt-2 inline-flex items-center gap-2 text-sm">
                      <LoadingSpinner className="h-4 w-4" />
                      <span>AI is typing...</span>
                    </div>
                  </div>
                </div>
              ) : null}

              <div ref={endRef} />
            </div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
            className="mt-4 flex flex-col gap-3 sm:flex-row"
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about billing, automation, credits, Instagram, or WhatsApp"
              maxLength={300}
              disabled={loading}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-100"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#081223_0%,#0b2a5b_55%,#1e5eff_100%)] px-5 py-3 text-sm font-semibold text-white transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
            >
              <SendHorizonal size={16} />
              Send
            </button>
          </form>
        </section>

        <aside className="space-y-5">
          <div className="brand-section-shell rounded-[28px] p-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <ShieldCheck size={14} />
              Safe responses
            </div>
            <h3 className="mt-3 text-base font-semibold text-slate-950">
              What this assistant can answer
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              <li>AI credits and usage basics</li>
              <li>Automation and reply flows</li>
              <li>Billing and plan upgrades</li>
              <li>Instagram connection guidance</li>
              <li>WhatsApp setup guidance</li>
            </ul>
          </div>

          <div className="brand-section-shell rounded-[28px] p-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
              <LifeBuoy size={14} />
              Direct support
            </div>
            <h3 className="mt-3 text-base font-semibold text-slate-950">
              Need more help?
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              If the assistant does not find a trusted answer, contact the team
              directly and we will help you from there.
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              <Mail size={15} />
              {SUPPORT_EMAIL}
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
