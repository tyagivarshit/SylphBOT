"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import { socket } from "@/lib/socket";
import { setDashboardRoutePrefetchPaused } from "@/lib/dashboardRoutePrefetch";
import { recordLifecycleEvent } from "@/lib/lifecycleTelemetry";
import { useDebounce } from "@/hooks/useDebounce";

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
  if (!currentValue) return nextValue;
  if (!nextValue) return currentValue;

  const currentTime = Date.parse(currentValue);
  const nextTime = Date.parse(nextValue);

  if (Number.isNaN(currentTime)) return nextValue;
  if (Number.isNaN(nextTime)) return currentValue;

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

function getLeadDisplayName(lead: Lead) {
  const platform = (lead?.platform || "").toUpperCase();

  if (platform === "WHATSAPP") {
    return lead?.phone || lead?.name || lead?.id || "User";
  }

  if (platform === "INSTAGRAM") {
    return lead?.name || (lead?.instagramId ? `@${lead.instagramId}` : lead?.id) || "User";
  }

  return lead?.name || lead?.phone || lead?.id || "User";
}

export type WorkspaceTab = "inbox" | "ai" | "chat";

interface ConversationsContextType {
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  selectedLead: Lead | null;
  setSelectedLead: (lead: Lead | null) => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  isMobileView: boolean | null;
  leadsLoading: boolean;
  messagesLoading: boolean;
  leadsError: string | null;
  messagesError: string | null;
  fetchLeads: () => Promise<void>;
  fetchMessages: (lead: Lead) => Promise<void>;
  activeTab: WorkspaceTab;
  setActiveTab: (tab: WorkspaceTab) => void;
  search: string;
  setSearch: (search: string) => void;
  filteredLeads: Lead[];
}

const ConversationsContext = createContext<ConversationsContextType | undefined>(
  undefined
);

export function ConversationsProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("inbox");
  const [search, setSearch] = useState("");
  
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
  const leadsRequestSequenceRef = useRef(0);
  const messagesRequestSequenceRef = useRef(0);

  const debouncedSearch = useDebounce(search, 180);

  const filteredLeads = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) {
      return leads;
    }
    return leads.filter((lead) =>
      getLeadDisplayName(lead).toLowerCase().includes(query)
    );
  }, [debouncedSearch, leads]);

  useEffect(() => {
    setDashboardRoutePrefetchPaused(true);
    return () => {
      setDashboardRoutePrefetchPaused(false);
    };
  }, []);

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
    const requestSequence = ++leadsRequestSequenceRef.current;

    try {
      setLeadsLoading(true);
      setLeadsError(null);

      const response = await apiFetch<{ conversations?: Lead[] }>(
        "/api/conversations?limit=40&offset=0",
        {
          credentials: "include",
        }
      );

      if (!response.success) {
        throw new Error(response.message || "We couldn't load your conversations.");
      }

      if (requestSequence !== leadsRequestSequenceRef.current) {
        recordLifecycleEvent("stale_response_ignored", {
          area: "conversations_leads",
          requestSequence,
        });
        return;
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
          // Auto switch to chat tab since lead is selected via query param
          setActiveTab("chat");
          return;
        }
      }

      if (isMobileView === false && !selectedLeadRef.current && nextLeads.length > 0) {
        setSelectedLead(nextLeads[0]);
      }
    } catch (fetchError) {
      if (requestSequence !== leadsRequestSequenceRef.current) {
        recordLifecycleEvent("stale_response_ignored", {
          area: "conversations_leads_error",
          requestSequence,
        });
        return;
      }

      console.error(fetchError);
      setLeads([]);
      setLeadsError(
        fetchError instanceof Error
          ? fetchError.message
          : "We couldn't load your conversations."
      );
    } finally {
      if (requestSequence === leadsRequestSequenceRef.current) {
        setLeadsLoading(false);
      }
    }
  }, [isMobileView, leadIdFromQuery]);

  useEffect(() => {
    void fetchLeads();
  }, [fetchLeads]);

  const fetchMessages = useCallback(
    async (lead: Lead) => {
      const requestSequence = ++messagesRequestSequenceRef.current;
      const requestLeadId = lead.id;

      try {
        setMessagesLoading(true);
        setMessagesError(null);

        const activeLeadId = lead.id;
        const activeRawUnreadCount = lead.rawUnreadCount || 0;
        const activeLastMessageTime = lead.lastMessageTime;

        const response = await apiFetch<{ messages?: unknown[] }>(
          `/api/conversations/${activeLeadId}/messages?limit=120`,
          {
            credentials: "include",
          }
        );

        if (!response.success) {
          throw new Error(response.message || "We couldn't load this conversation yet.");
        }

        if (
          requestSequence !== messagesRequestSequenceRef.current ||
          selectedLeadRef.current?.id !== requestLeadId
        ) {
          recordLifecycleEvent("stale_response_ignored", {
            area: "conversation_messages",
            requestSequence,
            requestLeadId,
          });
          return;
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
        if (
          requestSequence !== messagesRequestSequenceRef.current ||
          selectedLeadRef.current?.id !== requestLeadId
        ) {
          recordLifecycleEvent("stale_response_ignored", {
            area: "conversation_messages_error",
            requestSequence,
            requestLeadId,
          });
          return;
        }

        console.error(fetchError);
        setMessages([]);
        setMessagesError(
          fetchError instanceof Error
            ? fetchError.message
            : "We couldn't load this conversation yet."
        );
      } finally {
        if (requestSequence === messagesRequestSequenceRef.current) {
          setMessagesLoading(false);
        }
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

  const value = useMemo(
    () => ({
      leads,
      setLeads,
      selectedLead,
      setSelectedLead,
      messages,
      setMessages,
      isMobileView,
      leadsLoading,
      messagesLoading,
      leadsError,
      messagesError,
      fetchLeads,
      fetchMessages,
      activeTab,
      setActiveTab,
      search,
      setSearch,
      filteredLeads,
    }),
    [
      leads,
      selectedLead,
      messages,
      isMobileView,
      leadsLoading,
      messagesLoading,
      leadsError,
      messagesError,
      fetchLeads,
      fetchMessages,
      activeTab,
      search,
      filteredLeads,
    ]
  );

  return (
    <ConversationsContext.Provider value={value}>
      {children}
    </ConversationsContext.Provider>
  );
}

export function useConversations() {
  const context = useContext(ConversationsContext);
  if (!context) {
    throw new Error("useConversations must be used within a ConversationsProvider");
  }
  return context;
}
