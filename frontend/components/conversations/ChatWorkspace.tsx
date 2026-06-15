"use client";

import { useConversations } from "./ConversationsContext";
import ChatWindow from "./ChatWindow";
import { MessageSquare, ArrowRight } from "lucide-react";

export default function ChatWorkspace() {
  const {
    selectedLead,
    setSelectedLead,
    messages,
    setMessages,
    messagesLoading,
    messagesError,
    fetchMessages,
    setActiveTab,
  } = useConversations();

  // If no conversation is selected, show empty state directing them to Inbox
  if (!selectedLead) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-white/40 p-6 backdrop-blur-xl">
        <div className="mx-auto max-w-md w-full text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 text-blue-600 shadow-sm animate-bounce">
            <MessageSquare size={24} />
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            Select a conversation to start replying
          </h3>
          <p className="mt-2 text-sm text-slate-500 leading-6">
            You need to select a client or thread from your contact discovery lists before writing a reply message.
          </p>
          <button
            onClick={() => setActiveTab("inbox")}
            className="brand-button-primary mt-6 mx-auto inline-flex items-center gap-2 cursor-pointer"
          >
            Open Inbox
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  const handleBack = () => {
    setSelectedLead(null);
    setActiveTab("inbox");
  };

  const handleRetry = () => {
    if (selectedLead) {
      void fetchMessages(selectedLead);
    }
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-white/40 backdrop-blur-xl">
      <ChatWindow
        selectedLead={selectedLead}
        messages={messages}
        setMessages={setMessages}
        onBack={handleBack}
        loading={messagesLoading}
        error={messagesError}
        onRetry={handleRetry}
      />
    </div>
  );
}
