"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ChatSidebar from "@/components/conversations/ChatSidebar";
import ChatWindow from "@/components/conversations/ChatWindow";
import { apiFetch } from "@/lib/apiClient";
import { socket } from "@/lib/socket";
import { SkeletonCard } from "@/components/ui/feedback";

export interface Lead {
  id: string;
  name?: string;
  phone?: string | null;
  instagramId?: string | null;
  platform?: string | null;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
  rawUnreadCount?: number;
}

export interface Message {
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

type SeenConversationState = Record<
  string,
  {
    seenAt?: string;
    seenUnreadCount?: number;
  }
>;

const SEEN_CONVERSATIONS_STORAGE_KEY = "automexia.conversations.seen.v1";

function readSeenConversationState(): SeenConversationState {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(SEEN_CONVERSATIONS_STORAGE_KEY);

    if (!rawValue) {
      return {};
    }

    const parsedValue = JSON.parse(rawValue);

    return typeof parsedValue === "object" && parsedValue !== null
      ? parsedValue
      : {};
  } catch {
    return {};
  }
}

function writeSeenConversationState(state: SeenConversationState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      SEEN_CONVERSATIONS_STORAGE_KEY,
      JSON.stringify(state)
    );
  } catch {}
}

function getLatestTimestamp(currentValue?: string, nextValue?: string) {
  if (!currentValue) {
    return nextValue;
  }

  if (!nextValue) {
    return currentValue;
  }

  const currentTime = Date.parse(currentValue);
  const nextTime = Date.parse(nextValue);

  if (Number.isNaN(currentTime)) {
    return nextValue;
  }

  if (Number.isNaN(nextTime)) {
    return currentValue;
  }

  return nextTime > currentTime ? nextValue : currentValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeMessage(message: unknown): Message {
  const safeMessage = isRecord(message) ? message : {};
  const metadata = isRecord(safeMessage.metadata)
    ? (safeMessage.metadata as Message["metadata"])
    : null;
  const senderValue = String(safeMessage.sender || "USER")
    .trim()
    .toUpperCase();
  const sender =
    senderValue === "AI" || senderValue === "AGENT" ? senderValue : "USER";
  const cta =
    typeof safeMessage.cta === "string"
      ? safeMessage.cta
      : typeof metadata?.cta === "string"
        ? metadata.cta
        : null;

  return {
    id: String(safeMessage.id || ""),
    content: typeof safeMessage.content === "string" ? safeMessage.content : "",
    sender,
    createdAt:
      typeof safeMessage.createdAt === "string"
        ? safeMessage.createdAt
        : new Date().toISOString(),
    metadata,
    cta,
  };
}

function getClientMessageId(message?: Pick<Message, "metadata"> | null) {
  return typeof message?.metadata?.clientMessageId === "string" &&
    message.metadata.clientMessageId.trim()
    ? message.metadata.clientMessageId
    : null;
}

function upsertMessage(messages: Message[], nextMessage: unknown) {
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
}

function applySeenState(
  nextLeads: Lead[],
  seenState: SeenConversationState
): Lead[] {
  return nextLeads.map((lead) => {
    const serverUnreadCount = lead.unreadCount || 0;
    const persistedLeadState = seenState[lead.id];
    let effectiveUnreadCount = serverUnreadCount;

    if (persistedLeadState) {
      const lastMessageTime = lead.lastMessageTime
        ? Date.parse(lead.lastMessageTime)
        : Number.NaN;
      const seenAtTime = persistedLeadState.seenAt
        ? Date.parse(persistedLeadState.seenAt)
        : Number.NaN;

      if (
        !Number.isNaN(lastMessageTime) &&
        !Number.isNaN(seenAtTime) &&
        lastMessageTime <= seenAtTime
      ) {
        effectiveUnreadCount = 0;
      } else if (typeof persistedLeadState.seenUnreadCount === "number") {
        effectiveUnreadCount =
          serverUnreadCount >= persistedLeadState.seenUnreadCount
            ? serverUnreadCount - persistedLeadState.seenUnreadCount
            : serverUnreadCount;
      }
    }

    return {
      ...lead,
      rawUnreadCount: serverUnreadCount,
      unreadCount: Math.max(effectiveUnreadCount, 0),
    };
  });
}

function ConversationsPageContent() {
  const searchParams = useSearchParams();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMobileView, setIsMobileView] = useState<boolean | null>(null);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const leadIdFromQuery = searchParams.get("leadId");
  const seenStateRef = useRef<SeenConversationState>({});
  const selectedLeadRef = useRef<Lead | null>(null);

  const persistSeenState = useCallback(
    (
      leadId: string,
      options?: {
        latestSeenAt?: string;
        seenUnreadCount?: number;
      }
    ) => {
      const previousState = seenStateRef.current[leadId] || {};
      const nextStateForLead = {
        seenAt: getLatestTimestamp(previousState.seenAt, options?.latestSeenAt),
        seenUnreadCount:
          typeof options?.seenUnreadCount === "number"
            ? Math.max(previousState.seenUnreadCount || 0, options.seenUnreadCount)
            : previousState.seenUnreadCount,
      };

      seenStateRef.current = {
        ...seenStateRef.current,
        [leadId]: nextStateForLead,
      };

      writeSeenConversationState(seenStateRef.current);
    },
    []
  );

  const markLeadAsSeen = useCallback(
    (
      leadId: string,
      options?: {
        latestSeenAt?: string;
        seenUnreadCount?: number;
      }
    ) => {
      persistSeenState(leadId, options);

      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === leadId
            ? {
                ...lead,
                unreadCount: 0,
                rawUnreadCount:
                  typeof options?.seenUnreadCount === "number"
                    ? Math.max(lead.rawUnreadCount || 0, options.seenUnreadCount)
                    : lead.rawUnreadCount,
                lastMessageTime: getLatestTimestamp(
                  lead.lastMessageTime,
                  options?.latestSeenAt
                ),
              }
            : lead
        )
      );

      setSelectedLead((prev) =>
        prev?.id === leadId
          ? {
              ...prev,
              unreadCount: 0,
              rawUnreadCount:
                typeof options?.seenUnreadCount === "number"
                  ? Math.max(prev.rawUnreadCount || 0, options.seenUnreadCount)
                  : prev.rawUnreadCount,
              lastMessageTime: getLatestTimestamp(
                prev.lastMessageTime,
                options?.latestSeenAt
              ),
            }
          : prev
      );
    },
    [persistSeenState]
  );

  useEffect(() => {
    selectedLeadRef.current = selectedLead;
  }, [selectedLead]);

  useEffect(() => {
    const check = () => {
      setIsMobileView(window.innerWidth < 768);
    };

    check();
    window.addEventListener("resize", check);

    return () => window.removeEventListener("resize", check);
  }, []);

  const fetchLeads = useCallback(async () => {
    try {
      setLeadsLoading(true);
      setLeadsError(null);

      const response = await apiFetch<{ conversations?: Lead[] }>("/api/conversations", {
        credentials: "include",
      });

      if (!response.success) {
        throw new Error(response.message || "We couldn't load your conversations.");
      }

      const persistedSeenState = readSeenConversationState();
      const nextLeads = applySeenState(
        response.data?.conversations || [],
        persistedSeenState
      );

      seenStateRef.current = persistedSeenState;
      setLeads(nextLeads);

      if (leadIdFromQuery) {
        const matchedLead = nextLeads.find(
          (lead: Lead) => lead.id === leadIdFromQuery
        );

        if (matchedLead) {
          setSelectedLead(matchedLead);
          return;
        }
      }

      if (isMobileView === false && !selectedLeadRef.current && nextLeads.length > 0) {
        setSelectedLead(nextLeads[0]);
      }
    } catch (fetchError) {
      console.error(fetchError);
      setLeads([]);
      setLeadsError(
        fetchError instanceof Error
          ? fetchError.message
          : "We couldn't load your conversations."
      );
    } finally {
      setLeadsLoading(false);
    }
  }, [isMobileView, leadIdFromQuery]);

  useEffect(() => {
    void fetchLeads();
  }, [fetchLeads]);

  const fetchMessages = useCallback(
    async (lead: Lead) => {
      try {
        setMessagesLoading(true);
        setMessagesError(null);

        const activeLeadId = lead.id;
        const activeRawUnreadCount = lead.rawUnreadCount || 0;
        const activeLastMessageTime = lead.lastMessageTime;

        const response = await apiFetch<{ messages?: unknown[] }>(
          `/api/conversations/${activeLeadId}/messages`,
          {
            credentials: "include",
          }
        );

        if (!response.success) {
          throw new Error(response.message || "We couldn't load this conversation yet.");
        }

        const fetchedMessages = (response.data?.messages || []).map((message: unknown) =>
          normalizeMessage(message)
        );
        const latestSeenAt =
          fetchedMessages[fetchedMessages.length - 1]?.createdAt ||
          activeLastMessageTime;

        setMessages(fetchedMessages);
        markLeadAsSeen(activeLeadId, {
          latestSeenAt,
          seenUnreadCount: activeRawUnreadCount,
        });
      } catch (fetchError) {
        console.error(fetchError);
        setMessages([]);
        setMessagesError(
          fetchError instanceof Error
            ? fetchError.message
            : "We couldn't load this conversation yet."
        );
      } finally {
        setMessagesLoading(false);
      }
    },
    [markLeadAsSeen]
  );

  useEffect(() => {
    if (!selectedLead?.id) {
      setMessages([]);
      setMessagesError(null);
      setMessagesLoading(false);
      return;
    }

    void fetchMessages(selectedLead);
  }, [fetchMessages, selectedLead]);

  useEffect(() => {
    const activeLeadId = selectedLead?.id;

    if (!activeLeadId) {
      return;
    }

    socket.emit("join_conversation", activeLeadId);

    socket.on("new_message", (rawMessage: Message) => {
      const msg = normalizeMessage(rawMessage);
      const unreadDelta = msg.sender === "USER" ? 1 : 0;
      const currentLead = selectedLeadRef.current;
      const nextRawUnreadCount =
        currentLead?.id === activeLeadId
          ? (currentLead.rawUnreadCount || 0) + unreadDelta
          : unreadDelta;

      setMessages((prev) => upsertMessage(prev, msg));

      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === activeLeadId
            ? {
                ...lead,
                lastMessage: msg.content,
                lastMessageTime: msg.createdAt,
                rawUnreadCount: nextRawUnreadCount,
                unreadCount: 0,
              }
            : lead
        )
      );

      const nextSelectedLead =
        currentLead?.id === activeLeadId
          ? {
              ...currentLead,
              lastMessage: msg.content,
              lastMessageTime: msg.createdAt,
              rawUnreadCount: nextRawUnreadCount,
              unreadCount: 0,
            }
          : currentLead;

      selectedLeadRef.current = nextSelectedLead;
      setSelectedLead(nextSelectedLead);
      persistSeenState(activeLeadId, {
        latestSeenAt: msg.createdAt,
        seenUnreadCount: nextRawUnreadCount,
      });
    });

    return () => {
      socket.off("new_message");
    };
  }, [persistSeenState, selectedLead?.id]);

  const handleBack = () => {
    setSelectedLead(null);
  };

  return (
    <div className="min-h-[32rem] min-w-0 lg:h-[calc(100dvh-10.5rem)]">
      <div className="brand-section-shell flex h-full min-h-[32rem] w-full overflow-hidden rounded-[30px] p-0">
        <ChatSidebar
          leads={leads}
          selectedLead={selectedLead}
          setSelectedLead={setSelectedLead}
          loading={leadsLoading}
          error={leadsError}
          onRetry={() => void fetchLeads()}
        />

        <ChatWindow
          selectedLead={selectedLead}
          messages={messages}
          setMessages={setMessages}
          onBack={isMobileView ? handleBack : undefined}
          loading={messagesLoading}
          error={messagesError}
          onRetry={
            selectedLead
              ? () => void fetchMessages(selectedLead)
              : undefined
          }
        />
      </div>
    </div>
  );
}

function ConversationsPageFallback() {
  return (
    <div className="space-y-4">
      <SkeletonCard className="h-24" />
      <div className="grid gap-4 md:grid-cols-[340px_minmax(0,1fr)]">
        <SkeletonCard className="h-[36rem]" />
        <SkeletonCard className="h-[36rem]" />
      </div>
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
