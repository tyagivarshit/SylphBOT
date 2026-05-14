"use client";

type CommentAutomation = {
  id: string;
  keyword?: string | null;
  replyText?: string | null;
  dmText?: string | null;
  aiPrompt?: string | null;
  reelId?: string | null;
  triggerCount?: number;
  isActive?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastTriggeredAt?: string | null;
};

const formatTimestamp = (value?: string | null) => {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

export default function CommentAutomationCard({
  automation,
  isToggling = false,
  isDeleting = false,
  onEdit,
  onDelete,
  onToggle,
}: {
  automation: CommentAutomation;
  isToggling?: boolean;
  isDeleting?: boolean;
  onEdit?: (automation: CommentAutomation) => void;
  onDelete?: (automation: CommentAutomation) => void;
  onToggle?: (automation: CommentAutomation) => void;
}) {
  const usesAI = Boolean(
    typeof automation.aiPrompt === "string" && automation.aiPrompt.trim()
  );
  const isActive = Boolean(automation.isActive);

  return (
    <div
      className={`flex h-full flex-col justify-between rounded-[24px] border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${
        isActive
          ? "border-slate-200/80 bg-white/84"
          : "border-slate-200 bg-slate-50/90"
      }`}
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Instagram
              </span>
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
                Comment Keyword
              </span>
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                  usesAI
                    ? "bg-blue-50 text-blue-700"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {usesAI ? "AI" : "Template"}
              </span>
            </div>

            <h3 className="mt-3 truncate text-base font-semibold text-slate-950">
              {automation.keyword || "Untitled automation"}
            </h3>
          </div>

          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              isActive
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {isActive ? "Active" : "Paused"}
          </span>
        </div>

        <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Public Reply
          </p>
          <p className="mt-1 break-words text-sm text-slate-900">
            {automation.replyText || "Not configured"}
          </p>
        </div>

        <div className="rounded-[20px] border border-slate-200/80 bg-white px-4 py-3 text-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            DM Reply
          </p>
          <p className="mt-1 break-words text-slate-600">
            {usesAI
              ? automation.aiPrompt
              : automation.dmText || "Uses the public reply"}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Last Triggered
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {formatTimestamp(automation.lastTriggeredAt)}
            </p>
          </div>

          <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Post / Reel
            </p>
            <p className="mt-1 break-all text-sm font-medium text-slate-900">
              {automation.reelId || "Not connected"}
            </p>
          </div>
        </div>

        {automation.triggerCount !== undefined ? (
          <p className="text-xs font-medium text-slate-500">
            Triggered {automation.triggerCount} time
            {automation.triggerCount === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-slate-200/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={() => onEdit?.(automation)}
            className="text-sm font-semibold text-blue-600 transition hover:text-blue-700"
          >
            Edit
          </button>

          <button
            type="button"
            onClick={() => onDelete?.(automation)}
            disabled={isDeleting}
            className="text-sm font-semibold text-red-600 transition hover:text-red-700 disabled:opacity-60"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => onToggle?.(automation)}
          disabled={isToggling}
          className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition sm:w-auto ${
            isActive
              ? "bg-slate-900 text-white hover:bg-slate-800"
              : "bg-[linear-gradient(135deg,#081223_0%,#0b2a5b_55%,#1e5eff_100%)] text-white hover:shadow-md"
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {isToggling ? "Saving..." : isActive ? "Pause" : "Activate"}
        </button>
      </div>
    </div>
  );
}
