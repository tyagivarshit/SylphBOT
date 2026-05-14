"use client";

import type { OnboardingChatPreview } from "@/lib/onboarding";

type DemoChatPreviewProps = {
  title: string;
  label?: string;
  preview: OnboardingChatPreview;
  loadingText?: string;
};

const formatMessageTime = (value?: string | null) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

function MessageBubble({
  sender,
  content,
  time,
}: {
  sender: "USER" | "AI";
  content: string;
  time?: string | null;
}) {
  const isUser = sender === "USER";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-[22px] px-4 py-3 text-sm leading-6 shadow-sm ${
          isUser
            ? "rounded-br-md bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 text-white"
            : "rounded-bl-md border border-slate-200/80 bg-white/90 text-slate-900"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{content}</p>
        {time ? (
          <p
            className={`mt-1.5 text-right text-[10px] ${
              isUser ? "text-white/72" : "text-slate-400"
            }`}
          >
            {time}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function DemoChatPreview({
  title,
  label,
  preview,
  loadingText = "Generating the live AI reply...",
}: DemoChatPreviewProps) {
  return (
    <div className="rounded-[26px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(239,245,255,0.72),rgba(248,251,255,0.96))] p-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">{title}</p>
          {label ? (
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
              {label}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <MessageBubble
          sender="USER"
          content={
            preview.userMessage?.content ||
            "Hi, I want to know more about your service"
          }
          time={formatMessageTime(preview.userMessage?.createdAt)}
        />

        {preview.aiMessage ? (
          <MessageBubble
            sender="AI"
            content={preview.aiMessage.content}
            time={formatMessageTime(preview.aiMessage.createdAt)}
          />
        ) : (
          <div className="flex justify-start">
            <div className="max-w-[88%] rounded-[22px] rounded-bl-md border border-dashed border-slate-300/90 bg-white/82 px-4 py-3 text-sm text-slate-500">
              {loadingText}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
