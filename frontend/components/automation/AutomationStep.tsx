"use client";

import Link from "next/link";
import { Bot, Info, Sparkles } from "lucide-react";
import { useUpgrade } from "@/app/(dashboard)/layout";

type StepType = "MESSAGE" | "DELAY" | "CONDITION" | "BOOKING";

type StepConfig = {
  message?: string | null;
  condition?: string | null;
  delay?: number;
  replyMode?: "AI" | "TEMPLATE";
  aiPrompt?: string | null;
};

type AutomationStepProps = {
  step: {
    type: StepType;
    label: string;
    config: StepConfig;
  };
  index: number;
  total: number;
  aiDisabled?: boolean;
  aiRemaining?: number;
  addonCredits?: number;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onConfigChange: (key: string, value: string | number) => void;
};

const STEP_HELPERS: Record<StepType, string> = {
  MESSAGE: "Sends the reply your customer sees next.",
  DELAY: "Adds a time gap before the next step starts.",
  CONDITION: "Checks for a keyword or rule before continuing.",
  BOOKING: "Moves the conversation toward booking.",
};

const sanitizeStepText = (value?: string | null) =>
  value?.replace("ÃƒÂ°Ã…Â¸Ã¢â‚¬ËœÃ¢â‚¬Â¹", "").trim() || "";

export default function AutomationStep({
  step,
  index,
  total,
  aiDisabled = false,
  aiRemaining = 0,
  addonCredits = 0,
  onDelete,
  onMoveUp,
  onMoveDown,
  onConfigChange,
}: AutomationStepProps) {
  const { openUpgrade } = useUpgrade();
  const replyMode = step.config.replyMode === "AI" ? "AI" : "TEMPLATE";
  const isMessageStep = step.type === "MESSAGE";
  const openUsageLimitModal = () => {
    openUpgrade({
      variant: "usage_limit",
      title: "You've used all your AI replies for today",
      description:
        "Buy extra credits to keep AI automation steps running, or upgrade for a larger daily allowance.",
      remainingCredits: aiRemaining,
      addonCredits,
    });
  };

  const getColor = () => {
    switch (step.type) {
      case "MESSAGE":
        return "from-blue-600 to-cyan-500";
      case "DELAY":
        return "from-amber-500 to-orange-400";
      case "CONDITION":
        return "from-fuchsia-500 to-rose-500";
      case "BOOKING":
        return "from-emerald-500 to-teal-400";
      default:
        return "from-blue-600 to-cyan-500";
    }
  };

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white p-3 shadow-sm transition-all hover:shadow-md sm:p-4">
      <div
        className={`absolute left-0 top-0 h-1.5 w-full bg-gradient-to-r ${getColor()}`}
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Step {index + 1} of {total}
            </span>
            <span className="inline-flex rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
              {step.type}
            </span>
            {isMessageStep ? (
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                  replyMode === "AI"
                    ? "bg-blue-50 text-blue-700"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {replyMode === "AI" ? "AI step uses credits" : "Template step is free"}
              </span>
            ) : null}
          </div>

          <div>
            <p className="text-base font-semibold text-slate-900">{step.label}</p>
            <p className="mt-1 text-sm text-slate-500">{STEP_HELPERS[step.type]}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Move Up
          </button>

          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Move Down
          </button>

          <button
            type="button"
            onClick={onDelete}
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {isMessageStep ? (
          <>
            <div className="rounded-[18px] border border-slate-200 bg-slate-50/80 p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <span>Reply Mode</span>
                  <button
                    type="button"
                    title="AI replies use credits. Template replies are free."
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500"
                  >
                    <Info size={14} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">
                    AI Remaining: {aiRemaining}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700">
                    Extra Credits: {addonCredits}
                  </span>
                </div>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    if (aiDisabled) {
                      openUsageLimitModal();
                      return;
                    }

                    onConfigChange("replyMode", "AI");
                  }}
                  className={`rounded-[18px] border px-4 py-3 text-left transition ${
                    replyMode === "AI"
                      ? "border-blue-300 bg-blue-50 text-blue-900 shadow-sm"
                      : "border-slate-200 bg-white text-slate-700"
                  } ${aiDisabled ? "border-dashed" : ""}`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Bot size={16} />
                    Use AI Reply
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    Uses AI credits to generate the reply for this step.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onConfigChange("replyMode", "TEMPLATE")}
                  className={`rounded-[18px] border px-4 py-3 text-left transition ${
                    replyMode === "TEMPLATE"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Sparkles size={16} />
                    Use Template Reply
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    Free reply step. Sends exactly what you write.
                  </span>
                </button>
              </div>

              {aiDisabled ? (
                <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 md:flex-row md:items-center md:justify-between">
                  <span>You've used all your AI replies for today.</span>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Link
                      href="/billing"
                      className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                    >
                      Buy credits
                    </Link>
                    <button
                      type="button"
                      onClick={openUsageLimitModal}
                      className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                    >
                      Upgrade plan
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {replyMode === "AI" ? (
              <>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    AI Instruction
                  </label>
                  <textarea
                    rows={3}
                    value={step.config.aiPrompt || ""}
                    onChange={(event) =>
                      onConfigChange("aiPrompt", event.target.value || "")
                    }
                    placeholder="Tell the AI how this step should reply. Example: answer pricing briefly, qualify the lead, and invite them to book."
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    AI will generate the reply. Keep the instruction outcome-focused.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Fallback Template Reply
                  </label>
                  <textarea
                    rows={3}
                    value={sanitizeStepText(step.config.message)}
                    onChange={(event) =>
                      onConfigChange("message", event.target.value || "")
                    }
                    placeholder="Optional backup reply if AI is unavailable."
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    This fallback is free and keeps the flow usable if AI cannot respond.
                  </p>
                </div>
              </>
            ) : (
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Template Reply
                </label>
                <textarea
                  rows={3}
                  value={sanitizeStepText(step.config.message)}
                  onChange={(event) =>
                    onConfigChange("message", event.target.value || "")
                  }
                  placeholder="Enter the exact static reply to send."
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                />
                <p className="mt-2 text-xs text-slate-500">
                  This step is free. The automation sends exactly what you write.
                </p>
              </div>
            )}
          </>
        ) : null}

        {step.type === "CONDITION" ? (
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Condition Rule
            </label>
            <input
              value={step.config.condition || ""}
              onChange={(event) => onConfigChange("condition", event.target.value)}
              placeholder="Example: only continue when the user says price"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400 focus:outline-none focus:ring-4 focus:ring-fuchsia-100"
            />
            <p className="mt-2 text-xs text-slate-500">
              Use a simple keyword or phrase so the next action only runs in the
              right scenario.
            </p>
          </div>
        ) : null}

        {step.type === "DELAY" ? (
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Delay In Seconds
            </label>
            <input
              type="number"
              min={1}
              value={step.config.delay || ""}
              onChange={(event) =>
                onConfigChange("delay", Number(event.target.value) || 0)
              }
              placeholder="Example: 30"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-100"
            />
            <p className="mt-2 text-xs text-slate-500">
              Add breathing room before the next reply or action is sent.
            </p>
          </div>
        ) : null}

        {step.type === "BOOKING" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            This step hands the conversation into your booking flow when the
            automation reaches it.
          </div>
        ) : null}
      </div>
    </div>
  );
}
