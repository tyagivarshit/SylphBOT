"use client";

import { Suspense } from "react";
import { SkeletonCard } from "@/components/ui/feedback";
import {
  ConversationsProvider,
  useConversations,
} from "@/components/conversations/ConversationsContext";
import WorkspaceTabs from "@/components/conversations/WorkspaceTabs";
import InboxWorkspace from "@/components/conversations/InboxWorkspace";
import AIDeskWorkspace from "@/components/conversations/AIDeskWorkspace";
import ChatWorkspace from "@/components/conversations/ChatWorkspace";
import AIActivityWorkspace from "@/components/conversations/AIActivityWorkspace";

// Re-export Lead and Message types for backward compatibility with ChatSidebar and ChatWindow
export type { Lead, Message } from "@/components/conversations/ConversationsContext";

function ConversationsPageContent() {
  const { activeTab } = useConversations();

  return (
    <div className="flex flex-col gap-4 min-h-[32rem] min-w-0 lg:h-[calc(100dvh-10.5rem)]">
      <WorkspaceTabs />

      <div className="brand-section-shell flex-1 flex h-full min-h-[28rem] w-full overflow-hidden rounded-[30px] p-0">
        {activeTab === "inbox" && <InboxWorkspace />}
        {activeTab === "ai" && <AIDeskWorkspace />}
        {activeTab === "chat" && <ChatWorkspace />}
        {activeTab === "activity" && <AIActivityWorkspace />}
      </div>
    </div>
  );
}

function ConversationsPageFallback() {
  return (
    <div className="space-y-4">
      {/* Premium Skeleton for Switcher */}
      <SkeletonCard className="h-14 w-full max-w-md rounded-2xl" />
      {/* Premium Skeleton for Content Panel */}
      <div className="brand-section-shell h-[36rem] w-full rounded-[30px] animate-pulse bg-white/40" />
    </div>
  );
}

export default function ConversationsPage() {
  return (
    <Suspense fallback={<ConversationsPageFallback />}>
      <ConversationsProvider>
        <ConversationsPageContent />
      </ConversationsProvider>
    </Suspense>
  );
}
