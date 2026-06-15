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
import {
  getConversationIntelligence,
  type ConversationIntelligence,
} from "@/lib/conversationIntelligence";

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
const CONVERSATION_MODES_STORAGE_KEY = "automexia.conversations.modes.v1";
const OVERRIDE_DATES_STORAGE_KEY = "automexia.conversations.override_dates.v1";

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
export type FilterType = "all" | "hot" | "attention" | "human" | "ai";
export type ControlMode = "AUTONOMOUS" | "OBSERVE" | "HUMAN_OVERRIDE";

export interface ExtendedConversationIntelligence extends Omit<ConversationIntelligence, "recommendedBadge"> {
  recommendedBadge: "HUMAN_REQUIRED" | "HOT_OPPORTUNITY" | "NEEDS_ATTENTION" | "AI_HANDLING" | "HUMAN_CONTROLLED" | "NONE";
}

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
  filter: FilterType;
  setFilter: (filter: FilterType) => void;
  filteredLeads: Lead[];
  leadsIntelligence: Record<string, ExtendedConversationIntelligence>;
  
  // Phase 4: Conversation Control Modes State & Persistence
  conversationModes: Record<string, ControlMode>;
  setConversationMode: (leadId: string, mode: ControlMode) => void;
  overrideDates: Record<string, string>;
  setOverrideDate: (leadId: string, dateStr: string) => void;
}

const ConversationsContext = createContext<ConversationsContextType | undefined>(
  undefined
);

export function ConversationsProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("inbox");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMobileView, setIsMobileView] = useState<boolean | null>(null);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  // Phase 4 States
  const [conversationModes, setConversationModes] = useState<Record<string, ControlMode>>({});
  const [overrideDates, setOverrideDates] = useState<Record<string, string>>({});
  
  const leadIdFromQuery = searchParams.get("leadId");
  const seenStateRef = useRef<SeenConversationState>({});
  const selectedLeadRef = useRef<Lead | null>(null);
  const leadsRequestSequenceRef = useRef(0);
  const messagesRequestSequenceRef = useRef(0);

  const debouncedSearch = useDebounce(search, 180);

  // Initialize modes and dates from localStorage on client mount
  useEffect(() => {
    try {
      const savedModes = window.localStorage.getItem(CONVERSATION_MODES_STORAGE_KEY);
      if (savedModes) {
        setConversationModes(JSON.parse(savedModes));
      }

      const savedDates = window.localStorage.getItem(OVERRIDE_DATES_STORAGE_KEY);
      if (savedDates) {
        setOverrideDates(JSON.parse(savedDates));
      }
    } catch {}
  }, []);

  // Set control mode helper with localStorage persistence
  const setConversationMode = useCallback((leadId: string, mode: ControlMode) => {
    setConversationModes((prev) => {
      const next = { ...prev, [leadId]: mode };
      try {
        window.localStorage.setItem(CONVERSATION_MODES_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

    // Update override dates when human control is toggled
    setOverrideDates((prev) => {
      const next = { ...prev };
      if (mode === "HUMAN_OVERRIDE") {
        next[leadId] = new Date().toISOString();
      } else {
        delete next[leadId];
      }
      try {
        window.localStorage.setItem(OVERRIDE_DATES_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const setOverrideDate = useCallback((leadId: string, dateStr: string) => {
    setOverrideDates((prev) => {
      const next = { ...prev, [leadId]: dateStr };
      try {
        window.localStorage.setItem(OVERRIDE_DATES_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // Cache/memoize intelligence results with Human Override badges mapping
  const leadsIntelligence = useMemo(() => {
    const cache: Record<string, ExtendedConversationIntelligence> = {};
    leads.forEach((lead) => {
      const mode = conversationModes[lead.id] || "AUTONOMOUS";
      const baseIntel = getConversationIntelligence(lead);
      
      // Override badge to Human Controlled if Human Override mode is active
      const recommendedBadge: ExtendedConversationIntelligence["recommendedBadge"] =
        mode === "HUMAN_OVERRIDE" ? "HUMAN_CONTROLLED" : baseIntel.recommendedBadge;

      cache[lead.id] = {
        ...baseIntel,
        recommendedBadge,
      };
    });
    return cache;
  }, [leads, conversationModes]);

  // Compute final filtered and sorted leads
  const filteredLeads = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    let result = leads;

    // 1. Search Query Filters
    if (query) {
      result = result.filter((lead) => {
        const name = getLeadDisplayName(lead).toLowerCase();
        const platform = (lead.platform || "").toLowerCase();
        const lastMsg = (lead.lastMessage || "").toLowerCase();
        return (
          name.includes(query) ||
          platform.includes(query) ||
          lastMsg.includes(query)
        );
      });
    }

    // 2. Client-side Category Filters
    if (filter !== "all") {
      result = result.filter((lead) => {
        const intel = leadsIntelligence[lead.id];
        if (!intel) return false;

        switch (filter) {
          case "hot":
            return intel.recommendedBadge === "HOT_OPPORTUNITY";
          case "attention":
            // Human Controlled conversations automatically surface inside the Needs Attention workspace
            return (
              intel.recommendedBadge === "NEEDS_ATTENTION" ||
              intel.recommendedBadge === "HUMAN_CONTROLLED"
            );
          case "human":
            return (
              intel.recommendedBadge === "HUMAN_REQUIRED" ||
              intel.recommendedBadge === "HUMAN_CONTROLLED"
            );
          case "ai":
            return intel.recommendedBadge === "AI_HANDLING";
          default:
            return true;
        }
      });
    }

    // 3. Sorting following priority:
    // HUMAN_REQUIRED = 1, HUMAN_CONTROLLED = 1, HOT_OPPORTUNITY = 2, NEEDS_ATTENTION = 3, AI_HANDLING = 4, NONE = 5
    const badgePriority: Record<ExtendedConversationIntelligence["recommendedBadge"], number> = {
      HUMAN_REQUIRED: 1,
      HUMAN_CONTROLLED: 1, // Prioritize manually overridden threads alongside human handoffs
      HOT_OPPORTUNITY: 2,
      NEEDS_ATTENTION: 3,
      AI_HANDLING: 4,
      NONE: 5,
    };

    return [...result].sort((a, b) => {
      const intelA = leadsIntelligence[a.id];
      const intelB = leadsIntelligence[b.id];
      const badgeA = intelA?.recommendedBadge || "NONE";
      const badgeB = intelB?.recommendedBadge || "NONE";

      const prioA = badgePriority[badgeA];
      const prioB = badgePriority[badgeB];

      if (prioA !== prioB) {
        return prioA - prioB;
      }

      // Secondary: timestamp descending
      const timeA = a.lastMessageTime ? Date.parse(a.lastMessageTime) : 0;
      const timeB = b.lastMessageTime ? Date.parse(b.lastMessageTime) : 0;
      return timeB - timeA;
    });
  }, [leads, debouncedSearch, filter, leadsIntelligence]);

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
      filter,
      setFilter,
      filteredLeads,
      leadsIntelligence,
      conversationModes,
      setConversationMode,
      overrideDates,
      setOverrideDate,
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
      filter,
      filteredLeads,
      leadsIntelligence,
      conversationModes,
      setConversationMode,
      overrideDates,
      setOverrideDate,
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
