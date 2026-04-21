"use client";

export type AutomationFlowCardStep = {
  stepKey?: string | null;
  stepType?: string | null;
  message?: string | null;
  condition?: string | null;
  metadata?: {
    replyMode?: "AI" | "TEMPLATE";
    aiPrompt?: string | null;
    delay?: number;
    [key: string]: unknown;
  } | null;
};

export type AutomationFlowCardData = {
  id: string;
  name?: string | null;
  triggerValue?: string | null;
  triggerType?: string | null;
  channel?: string | null;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastTriggeredAt?: string | null;
  lastTriggeredTime?: string | null;
  steps?: AutomationFlowCardStep[];
};

const sanitizeText = (value?: string | null) =>
  value?.replace("ÃƒÂ°Ã…Â¸Ã¢â‚¬ËœÃ¢â‚¬Â¹", "").trim() || "";

const titleCase = (value?: string | null, fallback = "Not set") => {
  if (!value) {
    return fallback;
  }

  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

const getReplySummary = (steps: AutomationFlowCardStep[]) => {
  const messageSteps = steps.filter((step) => (step.stepType || "").toUpperCase() === "MESSAGE");

  if (!messageSteps.length) {
    return {
      label: "No reply step",
      usesAI: false,
      hasTemplate: false,
    };
  }

  const usesAI = messageSteps.some(
    (step) =>
      step.metadata?.replyMode === "AI" ||
      Boolean(sanitizeText(step.metadata?.aiPrompt))
  );
  const hasTemplate = messageSteps.some(
    (step) =>
      step.metadata?.replyMode !== "AI" ||
      Boolean(sanitizeText(step.message))
  );

  return {
    label: usesAI && hasTemplate ? "AI + Template" : usesAI ? "AI" : "Template",
    usesAI,
    hasTemplate,
  };
};

export default function AutomationFlowCard({
  automation,
  isToggling = false,
  isDeleting = false,
  onEdit,
  onToggle,
  onDelete,
}: {
  automation: AutomationFlowCardData;
  isToggling?: boolean;
  isDeleting?: boolean;
  onEdit?: (automation: AutomationFlowCardData) => void;
  onToggle?: (automation: AutomationFlowCardData) => void;
  onDelete?: (automation: AutomationFlowCardData) => void;
}) {
  const steps = automation.steps || [];
  const normalizedStatus = (automation.status || "ACTIVE").toUpperCase();
  const isActive = normalizedStatus === "ACTIVE";
  const replySummary = getReplySummary(steps);
  const firstPreview =
    sanitizeText(steps.find((step) => sanitizeText(step.message))?.message) ||
    sanitizeText(steps.find((step) => sanitizeText(step.condition))?.condition) ||
    "Flow is ready to capture and route new conversations.";
  const triggerLabel = titleCase(automation.triggerType || "KEYWORD", "Keyword");
  const platformLabel = titleCase(automation.channel || "INSTAGRAM", "Instagram");
  const lastTriggeredLabel = formatTimestamp(
    automation.lastTriggeredAt || automation.lastTriggeredTime
  );
  const stepSummary = steps
    .map((step) => titleCase(step.stepType, "Step"))
    .filter(Boolean)
    .join(" -> ");

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
                {platformLabel}
              </span>
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
                {triggerLabel}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                  replySummary.usesAI
                    ? "bg-blue-50 text-blue-700"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {replySummary.label}
              </span>
            </div>

            <h3 className="mt-3 truncate text-base font-semibold text-slate-950">
              {automation.name || "Untitled automation"}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Trigger: {automation.triggerValue || "Not configured"}
            </p>
          </div>

          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              isActive
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {isActive
              ? "Active"
              : normalizedStatus === "INACTIVE"
                ? "Paused"
                : titleCase(normalizedStatus, "Paused")}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Reply Type
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {replySummary.label}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {replySummary.usesAI
                ? "Contains AI steps that can consume credits."
                : "All reply steps are free templates."}
            </p>
          </div>

          <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Last Triggered
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {lastTriggeredLabel}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Shown when the backend provides trigger timestamps.
            </p>
          </div>
        </div>

        <div className="rounded-[20px] border border-blue-100/70 bg-blue-50/65 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
            Flow Preview
          </p>
          <p className="mt-1 break-words text-sm leading-6 text-slate-700">
            {firstPreview}
          </p>
        </div>

        <div className="rounded-[20px] border border-slate-200/80 bg-white px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Steps
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {steps.length} {steps.length === 1 ? "step" : "steps"}
          </p>
          <p className="mt-1 break-words text-xs leading-5 text-slate-500">
            {stepSummary || "Message"}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4 border-t border-slate-200/70 pt-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600">
            Platform: {platformLabel}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600">
            Trigger: {triggerLabel}
          </span>
          <span
            className={`rounded-full px-3 py-1.5 font-semibold ${
              replySummary.usesAI
                ? "bg-blue-50 text-blue-700"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {replySummary.usesAI ? "AI step uses credits" : "Template steps are free"}
          </span>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            {isToggling ? "Saving..." : isActive ? "Pause Flow" : "Activate Flow"}
          </button>
        </div>
      </div>
    </div>
  );
}
