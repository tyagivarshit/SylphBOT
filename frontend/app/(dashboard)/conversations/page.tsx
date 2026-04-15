"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useSearchParams } from "next/navigation";
import ChatSidebar from "@/components/conversations/ChatSidebar";
import ChatWindow from "@/components/conversations/ChatWindow";
import { buildApiUrl, getAbsoluteApiOrigin } from "@/lib/url";

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
  sender: "USER" | "AI";
  createdAt: string;
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
  const [isMobileView, setIsMobileView] = useState(false);
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
        const res = await fetch(buildApiUrl("/conversations"), {
          credentials: "include",
        });

        const data = await res.json();

        console.log("🔥 conversations API:", data);

        const persistedSeenState = readSeenConversationState();
        const nextLeads = applySeenState(
          data.conversations || [],
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
          }
        }
      } catch (err) {
        console.error(err);
        setLeads([]);
      }
    };

    fetchLeads();
  }, [leadIdFromQuery]);

  /* ================= FETCH MESSAGES ================= */
  useEffect(() => {
    const activeLeadId = selectedLead?.id;
    const activeRawUnreadCount = selectedLead?.rawUnreadCount || 0;
    const activeLastMessageTime = selectedLead?.lastMessageTime;
    if (!activeLeadId) return;

    const fetchMessages = async () => {
      try {
        const res = await fetch(
          buildApiUrl(`/conversations/${activeLeadId}/messages`),
          {
            credentials: "include",
          }
        );

        const data = await res.json();

        console.log("🔥 messages API:", data);

        const fetchedMessages = data.messages || [];
        const latestSeenAt =
          fetchedMessages[fetchedMessages.length - 1]?.createdAt ||
          activeLastMessageTime;

        setMessages(fetchedMessages);
        markLeadAsSeen(activeLeadId, {
          latestSeenAt,
          seenUnreadCount: activeRawUnreadCount,
        });
      } catch (err) {
        console.error(err);
        setMessages([]);
      }
    };

    fetchMessages();
  }, [
    markLeadAsSeen,
    selectedLead?.id,
    selectedLead?.lastMessageTime,
    selectedLead?.rawUnreadCount,
  ]);

  /* ================= SOCKET ================= */
  useEffect(() => {
    const activeLeadId = selectedLead?.id;
    if (!activeLeadId) return;

    const socket = io(getAbsoluteApiOrigin(), {
      transports: ["websocket"],
      withCredentials: true,
    });

    socket.emit("join_conversation", activeLeadId);

    socket.on("new_message", (msg: Message) => {
      const unreadDelta = msg.sender === "USER" ? 1 : 0;
      const currentLead = selectedLeadRef.current;
      const nextRawUnreadCount =
        currentLead?.id === activeLeadId
          ? (currentLead.rawUnreadCount || 0) + unreadDelta
          : unreadDelta;

      setMessages((prev) => [...prev, msg]);

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
      socket.disconnect();
    };
  }, [persistSeenState, selectedLead?.id]);

  /* ================= MOBILE BACK ================= */
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
        />

        <ChatWindow
          selectedLead={selectedLead}
          messages={messages}
          setMessages={setMessages}
          onBack={isMobileView ? handleBack : undefined}
        />

      </div>
    </div>
  );
}

function ConversationsPageFallback() {
  return (
    <div className="flex min-h-[32rem] items-center justify-center">
      <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
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
