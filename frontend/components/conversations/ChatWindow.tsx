"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Info,
  Send,
  Sparkles,
} from "lucide-react";
import { useUpgrade } from "@/app/(dashboard)/layout";
import {
  previewAIReply,
  sendConversationMessage,
  startBookingForLead,
} from "@/lib/message.service";
import { getUsageOverview, type UsageOverviewData } from "@/lib/usage.service";
import { getUsagePresentation } from "@/lib/usagePresentation";
import {
  EmptyState,
  LoadingSpinner,
  RetryState,
  SkeletonCard,
} from "@/components/ui/feedback";

type ReplyMode = "AI" | "TEMPLATE";
type OutboundBadge = "AI" | "TEMPLATE" | "MANUAL";
type ReplyOriginMap = Record<string, ReplyMode>;

interface Message {
  id: string;
  content: string;
  sender: "USER" | "AI" | "AGENT";
  createdAt: string;
  cta?: string | null;
  metadata?: {
    cta?: string | null;
    clientMessageId?: string | null;
    [key: string]: unknown;
  } | null;
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
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const CTA_CONFIG = {
  BOOK_CALL: {
    label: "Book call",
    className:
      "rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700",
  },
  VIEW_DEMO: {
    label: "View demo",
    className:
      "rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600",
  },
  BUY_NOW: {
    label: "Buy now",
    className:
      "rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700",
  },
  CAPTURE_LEAD: {
    label: "Capture lead",
    className:
      "rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700",
  },
} as const;

const CHAT_REPLY_ORIGIN_STORAGE_KEY = "automexia.chat.reply-origin.v1";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const readReplyOrigins = (): ReplyOriginMap => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(CHAT_REPLY_ORIGIN_STORAGE_KEY);

    if (!rawValue) {
      return {};
    }

    const parsedValue = JSON.parse(rawValue);

    return isRecord(parsedValue) ? (parsedValue as ReplyOriginMap) : {};
  } catch {
    return {};
  }
};

const writeReplyOrigins = (value: ReplyOriginMap) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      CHAT_REPLY_ORIGIN_STORAGE_KEY,
      JSON.stringify(value)
    );
  } catch {}
};

const normalizeMessage = (message: unknown): Message => {
  const rawMessage = isRecord(message) ? message : {};
  const metadata = isRecord(rawMessage.metadata)
    ? (rawMessage.metadata as Message["metadata"])
    : null;
  const senderValue = String(rawMessage.sender || "USER")
    .trim()
    .toUpperCase();
  const sender =
    senderValue === "AI" || senderValue === "AGENT" ? senderValue : "USER";
  const cta =
    typeof rawMessage.cta === "string"
      ? rawMessage.cta
      : typeof metadata?.cta === "string"
        ? metadata.cta
        : null;

  return {
    id: String(rawMessage.id || ""),
    content: typeof rawMessage.content === "string" ? rawMessage.content : "",
    sender,
    createdAt:
      typeof rawMessage.createdAt === "string"
        ? rawMessage.createdAt
        : new Date().toISOString(),
    metadata,
    cta,
  };
};

const getClientMessageId = (message?: Pick<Message, "metadata"> | null) =>
  typeof message?.metadata?.clientMessageId === "string" &&
  message.metadata.clientMessageId.trim()
    ? message.metadata.clientMessageId
    : null;

const upsertMessage = (messages: Message[], nextMessage: Message) => {
  const normalizedMessage = normalizeMessage(nextMessage);
  const nextClientMessageId = getClientMessageId(normalizedMessage);

  const existingIndex = messages.findIndex((message) => {
    const currentClientMessageId = getClientMessageId(message);

    return (
      message.id === normalizedMessage.id ||
      Boolean(
        nextClientMessageId &&
          currentClientMessageId &&
          nextClientMessageId === currentClientMessageId
      )
    );
  });

  if (existingIndex === -1) {
    return [...messages, normalizedMessage];
  }

  const nextMessages = [...messages];
  nextMessages[existingIndex] = {
    ...nextMessages[existingIndex],
    ...normalizedMessage,
    metadata: normalizedMessage.metadata || nextMessages[existingIndex].metadata,
    cta: normalizedMessage.cta ?? nextMessages[existingIndex].cta,
  };

  return nextMessages;
};

const getReplyBadge = (
  message: Message,
  replyOrigins: ReplyOriginMap
): OutboundBadge | null => {
  if (message.sender === "USER") {
    return null;
  }

  if (message.sender === "AI") {
    return "AI";
  }

  const clientMessageId = getClientMessageId(message);
  const storedMode =
    replyOrigins[message.id] ||
    (clientMessageId ? replyOrigins[clientMessageId] : undefined);

  if (storedMode === "AI") {
    return "AI";
  }

  if (storedMode === "TEMPLATE") {
    return "TEMPLATE";
  }

  return "MANUAL";
};

export default function ChatWindow({
  selectedLead,
  messages,
  setMessages,
  onBack,
  loading = false,
  error = null,
  onRetry,
}: Props) {
  const { openUpgrade } = useUpgrade();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [openingUnreadCount, setOpeningUnreadCount] = useState(0);
  const [unreadAnchorId, setUnreadAnchorId] = useState<string | null>(null);
  const [replyMode, setReplyMode] = useState<ReplyMode>("TEMPLATE");
  const [usage, setUsage] = useState<UsageOverviewData | null>(null);
  const [replyOrigins, setReplyOrigins] = useState<ReplyOriginMap>({});

  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const unreadMarkerRef = useRef<HTMLDivElement>(null);
  const initialPositionedRef = useRef(false);
  const previousMessageCountRef = useRef(0);
  const previousLeadIdRef = useRef<string | null>(null);

  const latestUserMessage = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.sender === "USER")
        ?.content.trim() || "",
    [messages]
  );

  const usageState = useMemo(() => getUsagePresentation(usage), [usage]);

  const openUsageLimitModal = useCallback(() => {
    openUpgrade({
      variant: "usage_limit",
      title: usageState.notice?.title,
      description: usageState.notice?.message,
      remainingCredits: usageState.aiRemaining,
      addonCredits: usageState.addonCredits,
    });
  }, [openUpgrade, usageState.addonCredits, usageState.aiRemaining, usageState.notice]);

  const openUpgradePrompt = useCallback(() => {
    openUpgrade({
      variant: usageState.aiDisabled ? "usage_limit" : "feature",
      title:
        usageState.notice?.title || "Upgrade to keep replies moving faster",
      description:
        usageState.notice?.message ||
        "Get a larger AI allowance and more room for high-intent conversations as your inbox grows.",
      remainingCredits: usageState.aiRemaining,
      addonCredits: usageState.addonCredits,
    });
  }, [
    openUpgrade,
    usageState.addonCredits,
    usageState.aiDisabled,
    usageState.aiRemaining,
    usageState.notice,
  ]);

  const loadUsage = useCallback(async () => {
    const data = await getUsageOverview();

    if (data) {
      setUsage(data);
    }
  }, []);

  const persistReplyOrigin = useCallback((key: string, value: ReplyMode) => {
    if (!key) {
      return;
    }

    setReplyOrigins((previous) => {
      const nextValue = {
        ...previous,
        [key]: value,
      };

      writeReplyOrigins(nextValue);

      return nextValue;
    });
  }, []);

  const removeReplyOrigin = useCallback((key: string) => {
    if (!key) {
      return;
    }

    setReplyOrigins((previous) => {
      if (!(key in previous)) {
        return previous;
      }

      const nextValue = { ...previous };
      delete nextValue[key];
      writeReplyOrigins(nextValue);
      return nextValue;
    });
  }, []);

  useEffect(() => {
    setReplyOrigins(readReplyOrigins());
  }, []);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  useEffect(() => {
    if (usageState.aiDisabled && replyMode === "AI") {
      setReplyMode("TEMPLATE");
    }
  }, [replyMode, usageState.aiDisabled]);

  useEffect(() => {
    const activeLeadId = selectedLead?.id || null;

    if (previousLeadIdRef.current === activeLeadId) {
      return;
    }

    previousLeadIdRef.current = activeLeadId;
    initialPositionedRef.current = false;
    previousMessageCountRef.current = 0;
    setOpeningUnreadCount(selectedLead?.unreadCount || 0);
    setUnreadAnchorId(null);
    setSendError(null);
  }, [selectedLead]);

  useEffect(() => {
    if (
      !selectedLead ||
      !messages.length ||
      unreadAnchorId ||
      openingUnreadCount <= 0
    ) {
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
    if (!viewport) {
      return;
    }

    if (
      !initialPositionedRef.current &&
      openingUnreadCount > 0 &&
      !unreadAnchorId
    ) {
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

  const handleReplyModeChange = (mode: ReplyMode) => {
    if (mode === "AI" && usageState.aiDisabled) {
      openUsageLimitModal();
      return;
    }

    setReplyMode(mode);
  };

  const sendMessage = async () => {
    if (!selectedLead || sending) {
      return;
    }

    const draft = input.trim();
    const composeSource =
      replyMode === "AI" ? draft || latestUserMessage : draft;

    if (!composeSource) {
      setSendError(
        replyMode === "AI"
          ? "Add guidance for the AI reply, or keep the latest customer message visible so AI can use it."
          : "Write the reply you want to send."
      );
      return;
    }

    if (replyMode === "AI" && usageState.aiDisabled) {
      setSendError("You've used all your AI replies for today.");
      openUsageLimitModal();
      return;
    }

    const clientMessageId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    let outboundContent = composeSource;
    let optimisticInserted = false;

    setSending(true);
    setSendError(null);

    try {
      if (replyMode === "AI") {
        const aiPreviewResult = await previewAIReply({
          leadId: selectedLead.id,
          message: composeSource,
        });

        const aiPreviewData = aiPreviewResult.data;

        if (
          aiPreviewResult.status === 429 ||
          aiPreviewData?.message === "Usage limit reached"
        ) {
          setSendError("You've used all your AI replies for today.");
          openUsageLimitModal();
          await loadUsage();
          return;
        }

        if (!aiPreviewResult.ok || aiPreviewData?.success === false) {
          throw new Error(
            aiPreviewData?.message ||
              aiPreviewResult.message ||
              "We couldn't generate the AI reply right now."
          );
        }

        outboundContent =
          typeof aiPreviewData?.aiReply === "string"
            ? aiPreviewData.aiReply.trim()
            : "";

        if (!outboundContent) {
          throw new Error("We couldn't generate the AI reply right now.");
        }
      }

      setInput("");
      persistReplyOrigin(clientMessageId, replyMode);

      const tempMessage: Message = {
        id: `temp-${clientMessageId}`,
        content: outboundContent,
        sender: "AGENT",
        createdAt: new Date().toISOString(),
        metadata: {
          clientMessageId,
        },
      };

      setMessages((prev) => upsertMessage(prev, tempMessage));
      optimisticInserted = true;

      const response = await sendConversationMessage(selectedLead.id, {
        content: outboundContent,
        sender: "AGENT",
        clientMessageId,
      });
      const data = response.data;
      const sendFailureMessage =
        typeof data?.message === "string" ? data.message : undefined;
      const persistedMessage = data?.message
        ? normalizeMessage(data.message)
        : null;

      if (persistedMessage) {
        persistReplyOrigin(persistedMessage.id, replyMode);
        const persistedClientMessageId = getClientMessageId(persistedMessage);

        if (persistedClientMessageId) {
          persistReplyOrigin(persistedClientMessageId, replyMode);
        }

        setMessages((prev) => upsertMessage(prev, persistedMessage));
      } else if (!response.ok || data?.success === false) {
        setMessages((prev) =>
          prev.filter(
            (message) => getClientMessageId(message) !== clientMessageId
          )
        );
        optimisticInserted = false;
        removeReplyOrigin(clientMessageId);
        setInput(draft);
      }

      if (
        !response.ok ||
        data?.success === false ||
        data?.delivery?.delivered === false
      ) {
        setSendError(
          data?.delivery?.error ||
            sendFailureMessage ||
            response.message ||
            "The reply was saved, but delivery to Instagram or WhatsApp was not confirmed."
        );
      }
    } catch (sendMessageError) {
      console.error(sendMessageError);

      if (optimisticInserted) {
        setMessages((prev) =>
          prev.filter((message) => getClientMessageId(message) !== clientMessageId)
        );
      }

      removeReplyOrigin(clientMessageId);
      setInput(draft);
      setSendError(
        sendMessageError instanceof Error
          ? sendMessageError.message
          : "We couldn't confirm delivery yet. Please try again."
      );
    } finally {
      setSending(false);
      await loadUsage();
    }
  };

  const handleBooking = async () => {
    if (!selectedLead) {
      return;
    }

    await startBookingForLead(selectedLead.id);
  };

  const isSendDisabled =
    sending ||
    !selectedLead ||
    (replyMode === "AI" ? !input.trim() && !latestUserMessage : !input.trim());

  if (!selectedLead) {
    return (
      <div className="hidden flex-1 items-center justify-center bg-white/35 p-6 md:flex">
        <div className="max-w-md text-center">
          <EmptyState
            eyebrow="Conversation desk"
            title="Select a conversation to start replying"
            description="Open a lead from the sidebar."
            actionLabel="Create automation"
            actionHref="/automation"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(239,245,255,0.6),rgba(248,251,255,0.96))]">
      {onBack ? (
        <button
          onClick={onBack}
          className="absolute left-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/92 text-slate-600 shadow-sm backdrop-blur transition hover:text-slate-900 md:hidden"
        >
          <ArrowLeft size={18} />
        </button>
      ) : null}

      <div className="border-b border-slate-200/80 bg-white/86 px-3 py-3 backdrop-blur-xl md:px-5">
        <div className={`flex flex-col gap-3 ${onBack ? "pl-12 md:pl-0" : ""}`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                Conversation
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-950">
                {selectedLead.name || "Lead conversation"}
              </h2>
            </div>
          </div>

          {usageState.notice ? (
            <div
              className={`rounded-[20px] border px-4 py-3 text-sm ${
                usageState.notice.tone === "danger"
                  ? "border-rose-200 bg-rose-50 text-rose-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex items-start gap-2 font-medium">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="block font-semibold">
                      {usageState.notice.title}
                    </span>
                    <span className="block">{usageState.notice.message}</span>
                  </span>
                </span>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Link href="/billing" className="brand-button-secondary">
                    Buy Credits
                  </Link>
                  <button
                    type="button"
                    onClick={openUpgradePrompt}
                    className="brand-button-primary"
                  >
                    Upgrade Plan
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div
        ref={scrollViewportRef}
        className={`brand-scrollbar flex-1 overflow-y-auto px-3 py-4 md:px-5 md:py-5 ${
          onBack ? "pt-4 md:pt-5" : ""
        }`}
      >
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className={`flex ${index % 2 === 0 ? "justify-start" : "justify-end"}`}
              >
                <SkeletonCard className="h-20 w-[72%] max-w-md" />
              </div>
            ))}
          </div>
        ) : null}

        {!loading && error && onRetry ? (
          <RetryState
            title="Messages unavailable"
            description={error}
            onRetry={onRetry}
          />
        ) : null}

        {!loading && !error ? (
          <div className="flex min-h-full flex-col justify-end gap-2.5">
            {(messages || []).length === 0 ? (
              <div className="mx-auto max-w-md rounded-3xl border border-slate-200/80 bg-white/88 px-4 py-4 text-center shadow-sm">
                <p className="text-sm font-medium text-slate-800">
                  No messages yet
                </p>
              </div>
            ) : (
              (messages || []).map((msg) => {
                const isIncoming = msg.sender === "USER";
                const replyBadge = getReplyBadge(msg, replyOrigins);
                const ctaConfig =
                  msg.cta && msg.cta !== "NONE"
                    ? CTA_CONFIG[msg.cta as keyof typeof CTA_CONFIG]
                    : null;
                const useAIBubble = replyBadge === "AI";
                const useTemplateBubble = replyBadge === "TEMPLATE";

                return (
                  <Fragment key={msg.id}>
                    {msg.id === unreadAnchorId && openingUnreadCount > 0 ? (
                      <div ref={unreadMarkerRef} className="h-0" />
                    ) : null}

                    <div className={`flex ${isIncoming ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`max-w-[86%] rounded-[22px] px-4 py-3 text-sm leading-5 shadow-sm md:max-w-[72%] ${
                          isIncoming
                            ? "rounded-bl-md border border-slate-200/90 bg-white/88 text-slate-900 backdrop-blur"
                            : useAIBubble
                              ? "rounded-br-md border border-blue-200/80 bg-blue-50/90 text-slate-900 backdrop-blur"
                              : useTemplateBubble
                                ? "rounded-br-md border border-emerald-200/80 bg-emerald-50/90 text-slate-900 backdrop-blur"
                                : "rounded-br-md bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 text-white"
                        }`}
                      >
                        {!isIncoming && replyBadge ? (
                          <span
                            className={`mb-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                              replyBadge === "AI"
                                ? "bg-blue-100 text-blue-700"
                                : replyBadge === "TEMPLATE"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-white/20 text-white"
                            }`}
                          >
                            {replyBadge === "AI"
                              ? "AI"
                              : replyBadge === "TEMPLATE"
                                ? "Template"
                                : "Manual"}
                          </span>
                        ) : null}

                        <p className="whitespace-pre-wrap break-words">
                          {msg.content}
                        </p>

                        {msg.sender === "AI" && ctaConfig ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {msg.cta === "BOOK_CALL" ? (
                              <button
                                type="button"
                                onClick={handleBooking}
                                className={`${ctaConfig.className} transition hover:brightness-95`}
                              >
                                {ctaConfig.label}
                              </button>
                            ) : (
                              <span className={ctaConfig.className}>
                                {ctaConfig.label}
                              </span>
                            )}
                          </div>
                        ) : null}

                        <p
                          className={`mt-1.5 text-right text-[10px] ${
                            isIncoming
                              ? "text-slate-400"
                              : useAIBubble || useTemplateBubble
                                ? "text-slate-500"
                                : "text-white/70"
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
        ) : null}
      </div>

      <div className="border-t border-slate-200/80 bg-white/88 px-3 py-3 backdrop-blur-xl md:px-5">
        {sendError ? (
          <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{sendError}</span>
              <button
                type="button"
                onClick={() => void sendMessage()}
                className="brand-button-secondary"
              >
                Try again
              </button>
            </div>
          </div>
        ) : null}

        <div className="mb-3 rounded-[22px] border border-slate-200/80 bg-slate-50/80 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span>Reply mode</span>
            <button
              type="button"
              title="Choose how this reply should be sent."
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500"
            >
              <Info size={14} />
            </button>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <button
              type="button"
              onClick={() => handleReplyModeChange("AI")}
              className={`rounded-[18px] border px-4 py-3 text-left transition ${
                replyMode === "AI"
                  ? "border-blue-300 bg-blue-50 text-blue-900 shadow-sm"
                  : "border-slate-200 bg-white text-slate-700"
              } ${usageState.aiDisabled ? "border-dashed" : ""}`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Bot size={16} />
                Use AI reply
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleReplyModeChange("TEMPLATE")}
              className={`rounded-[18px] border px-4 py-3 text-left transition ${
                replyMode === "TEMPLATE"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles size={16} />
                Use template reply
              </span>
            </button>
          </div>
        </div>

        <div className="brand-input-shell gap-2 pl-4 pr-2">
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value || "");
              if (sendError) {
                setSendError(null);
              }
            }}
            placeholder={
              replyMode === "AI"
                ? "Add AI guidance or leave blank to use the latest customer message"
                : "Write the exact reply to send"
            }
            className="min-w-0 bg-transparent text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void sendMessage();
              }
            }}
          />

          <button
            onClick={() => void sendMessage()}
            disabled={isSendDisabled}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 text-white shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            title={
              replyMode === "AI" && sending
                ? "Generating AI reply"
                : "Send reply"
            }
          >
            {sending ? <LoadingSpinner className="h-4 w-4" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
