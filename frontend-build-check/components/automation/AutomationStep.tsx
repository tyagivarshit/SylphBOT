"use client";

import { Bot, Sparkles } from "lucide-react";
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

const sanitizeStepText = (value?: string | null) =>
  value?.replace("ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¹", "").trim() || "";

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
                {replyMode}
              </span>
            ) : null}
          </div>

          <p className="text-base font-semibold text-slate-900">{step.label}</p>
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
              <div className="grid gap-2 md:grid-cols-2">
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
                    AI Reply
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
                    Template Reply
                  </span>
                </button>
              </div>
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
                    placeholder="Answer pricing briefly, qualify the lead, and invite them to book."
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Fallback Reply
                  </label>
                  <textarea
                    rows={3}
                    value={sanitizeStepText(step.config.message)}
                    onChange={(event) =>
                      onConfigChange("message", event.target.value || "")
                    }
                    placeholder="Optional backup reply"
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                  />
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
                  placeholder="Enter the exact reply to send"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                />
              </div>
            )}
          </>
        ) : null}

        {step.type === "CONDITION" ? (
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Condition
            </label>
            <input
              value={step.config.condition || ""}
              onChange={(event) => onConfigChange("condition", event.target.value)}
              placeholder="only continue when the user says price"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400 focus:outline-none focus:ring-4 focus:ring-fuchsia-100"
            />
          </div>
        ) : null}

        {step.type === "DELAY" ? (
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Delay in Seconds
            </label>
            <input
              type="number"
              min={1}
              value={step.config.delay || ""}
              onChange={(event) =>
                onConfigChange("delay", Number(event.target.value) || 0)
              }
              placeholder="30"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-100"
            />
          </div>
        ) : null}

        {step.type === "BOOKING" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Booking step
          </div>
        ) : null}
      </div>
    </div>
  );
}
