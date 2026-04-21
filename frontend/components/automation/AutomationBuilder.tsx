"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useUpgrade } from "@/app/(dashboard)/layout";
import { buildApiUrl } from "@/lib/url";
import { notify } from "@/lib/toast";
import AutomationStep from "./AutomationStep";

export type AutomationStepType = "MESSAGE" | "DELAY" | "CONDITION" | "BOOKING";

export type AutomationStepConfig = {
  message?: string | null;
  condition?: string | null;
  delay?: number;
  replyMode?: "AI" | "TEMPLATE";
  aiPrompt?: string | null;
};

export type AutomationPayloadStep = {
  type: AutomationStepType;
  config: AutomationStepConfig;
};

export type AutomationBuilderStepInput = {
  id?: string | number;
  type?: string | null;
  stepType?: string | null;
  message?: string | null;
  condition?: string | null;
  metadata?: AutomationStepConfig | null;
  config?: AutomationStepConfig;
};

type UsagePayload = {
  addonCredits?: number;
  ai: {
    usedToday: number;
    limit: number;
    remaining: number | null;
  };
  addons: {
    aiCredits: number;
  };
};

type Step = {
  id: number;
  type: AutomationStepType;
  label: string;
  config: AutomationStepConfig;
};

const STEP_DESCRIPTIONS: Record<AutomationStepType, string> = {
  MESSAGE: "Send a reply instantly with AI or a free template.",
  DELAY: "Wait before the next action runs.",
  CONDITION: "Continue only when the conversation matches your rule.",
  BOOKING: "Hand the user into your booking step.",
};

const sanitizeStepText = (value?: string | null) =>
  value?.replace("ÃƒÂ°Ã…Â¸Ã¢â‚¬ËœÃ¢â‚¬Â¹", "").trim() || "";

const getStepLabel = (type: AutomationStepType) => {
  switch (type) {
    case "MESSAGE":
      return "Send Message";
    case "DELAY":
      return "Wait";
    case "CONDITION":
      return "Condition";
    case "BOOKING":
      return "Booking";
    default:
      return "Step";
  }
};

const normalizeStepType = (
  value?: string | null
): AutomationStepType | null => {
  switch ((value || "").toUpperCase()) {
    case "MESSAGE":
    case "DELAY":
    case "CONDITION":
    case "BOOKING":
      return value!.toUpperCase() as AutomationStepType;
    default:
      return null;
  }
};

const createStep = (
  type: AutomationStepType,
  id = Date.now() + Math.floor(Math.random() * 1000)
): Step => ({
  id,
  type,
  label: getStepLabel(type),
  config: type === "MESSAGE" ? { replyMode: "TEMPLATE" } : {},
});

const normalizeInitialSteps = (
  initialSteps?: AutomationBuilderStepInput[]
): Step[] => {
  if (!initialSteps?.length) {
    return [createStep("MESSAGE", 1)];
  }

  const normalized: Array<Step | null> = initialSteps.map((step, index) => {
      const type = normalizeStepType(step.type || step.stepType);

      if (!type) {
        return null;
      }

      const metadata = step.metadata || step.config || {};
      const replyMode =
        metadata.replyMode === "AI" ||
        Boolean(sanitizeStepText(metadata.aiPrompt))
          ? "AI"
          : "TEMPLATE";
      const delay =
        typeof metadata.delay === "number" && Number.isFinite(metadata.delay)
          ? metadata.delay
          : undefined;

      return {
        id:
          typeof step.id === "number"
            ? step.id
            : typeof step.id === "string" && Number.isFinite(Number(step.id))
              ? Number(step.id)
              : Date.now() + index,
        type,
        label: getStepLabel(type),
        config: {
          message: sanitizeStepText(metadata.message ?? step.message),
          condition: sanitizeStepText(metadata.condition ?? step.condition),
          delay,
          replyMode: type === "MESSAGE" ? replyMode : undefined,
          aiPrompt: sanitizeStepText(metadata.aiPrompt),
        },
      };
    });

  const filtered = normalized.filter((step): step is Step => step !== null);

  return filtered.length ? filtered : [createStep("MESSAGE", 1)];
};

export default function AutomationBuilder({
  plan = "BASIC",
  onChange,
  initialSteps,
}: {
  plan?: "BASIC" | "PRO" | "ELITE";
  onChange?: (steps: AutomationPayloadStep[]) => void;
  initialSteps?: AutomationBuilderStepInput[];
}) {
  const { openUpgrade } = useUpgrade();
  const [steps, setSteps] = useState<Step[]>(() =>
    normalizeInitialSteps(initialSteps)
  );
  const [usage, setUsage] = useState<UsagePayload | null>(null);

  const allowedSteps = useMemo(() => {
    if (plan === "BASIC") return ["MESSAGE"];
    if (plan === "PRO") return ["MESSAGE", "DELAY", "CONDITION"];
    return ["MESSAGE", "DELAY", "CONDITION", "BOOKING"];
  }, [plan]);

  const addonCredits = usage?.addonCredits ?? usage?.addons.aiCredits ?? 0;
  const aiRemaining = usage?.ai.remaining ?? 0;
  const aiDisabled = usage ? aiRemaining <= 0 && addonCredits <= 0 : false;

  const flowSummary = useMemo(() => {
    const aiSteps = steps.filter(
      (step) =>
        step.type === "MESSAGE" &&
        (step.config.replyMode === "AI" || Boolean(step.config.aiPrompt))
    ).length;
    const templateSteps = steps.filter(
      (step) => step.type === "MESSAGE" && step.config.replyMode !== "AI"
    ).length;

    return {
      aiSteps,
      templateSteps,
      totalSteps: steps.length,
    };
  }, [steps]);

  const openUsageLimitModal = () => {
    openUpgrade({
      variant: "usage_limit",
      title: "You've used all your AI replies for today",
      description:
        "Buy extra credits to keep AI steps live, or upgrade for a larger daily allowance.",
      remainingCredits: aiRemaining,
      addonCredits,
    });
  };

  useEffect(() => {
    setSteps(normalizeInitialSteps(initialSteps));
  }, [initialSteps]);

  useEffect(() => {
    let mounted = true;

    const loadUsage = async () => {
      try {
        const response = await fetch(buildApiUrl("/api/usage"), {
          credentials: "include",
          cache: "no-store",
        });

        const data = await response.json().catch(() => null);

        if (!mounted || !response.ok || !data || data.success === false) {
          return;
        }

        setUsage(data as UsagePayload);
      } catch {}
    };

    void loadUsage();

    return () => {
      mounted = false;
    };
  }, []);

  const formatSteps = (source: Step[]): AutomationPayloadStep[] =>
    source.map((step) => {
      const cleanConfig: AutomationStepConfig = {};

      if (sanitizeStepText(step.config.message)) {
        cleanConfig.message = sanitizeStepText(step.config.message);
      }

      if (sanitizeStepText(step.config.condition)) {
        cleanConfig.condition = sanitizeStepText(step.config.condition);
      }

      if (typeof step.config.delay === "number" && step.config.delay > 0) {
        cleanConfig.delay = step.config.delay;
      }

      if (step.type === "MESSAGE") {
        cleanConfig.replyMode =
          step.config.replyMode === "AI" ? "AI" : "TEMPLATE";
      }

      if (sanitizeStepText(step.config.aiPrompt)) {
        cleanConfig.aiPrompt = sanitizeStepText(step.config.aiPrompt);
      }

      return {
        type: step.type,
        config: cleanConfig,
      };
    });

  useEffect(() => {
    onChange?.(formatSteps(steps));
  }, [onChange, steps]);

  const updateSteps = (newSteps: Step[]) => {
    setSteps(newSteps);
  };

  const addStep = (type: AutomationStepType) => {
    if (!allowedSteps.includes(type)) {
      notify.warning(`Upgrade your plan to use ${getStepLabel(type)} steps.`);
      openUpgrade({
        title: `Upgrade to unlock ${getStepLabel(type)} steps`,
        description:
          "Move beyond basic message flows with more advanced automation controls on a higher plan.",
      });
      return;
    }

    updateSteps([...steps, createStep(type)]);
  };

  const removeStep = (id: number) => {
    const remainingSteps = steps.filter((step) => step.id !== id);
    updateSteps(remainingSteps.length ? remainingSteps : [createStep("MESSAGE", 1)]);
  };

  const moveStep = (index: number, direction: "up" | "down") => {
    const newSteps = [...steps];
    const target = direction === "up" ? index - 1 : index + 1;

    if (target < 0 || target >= steps.length) {
      return;
    }

    [newSteps[index], newSteps[target]] = [newSteps[target], newSteps[index]];

    updateSteps(newSteps);
  };

  const updateConfig = (id: number, key: string, value: string | number) => {
    const newSteps = steps.map((step) =>
      step.id === id
        ? {
            ...step,
            config: {
              ...step.config,
              [key]: value,
            },
          }
        : step
    );

    updateSteps(newSteps);
  };

  const getStepButtonClass = (enabled: boolean) =>
    [
      "flex items-center justify-center rounded-2xl border px-3 py-2.5 text-sm font-semibold transition",
      enabled
        ? "border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 text-blue-700 hover:border-blue-300 hover:shadow-sm"
        : "border-slate-200 bg-slate-100 text-slate-400",
    ].join(" ");

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="rounded-[22px] border border-slate-200 bg-slate-50/85 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900">
              Build the flow in order
            </p>
            <p className="text-xs leading-5 text-slate-500">
              Step 1 starts the reply. Add wait, condition, or booking steps after
              that to control what happens next.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-900 px-3 py-1.5 font-semibold text-white">
              {flowSummary.totalSteps}{" "}
              {flowSummary.totalSteps === 1 ? "step" : "steps"}
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">
              {flowSummary.aiSteps} AI step
              {flowSummary.aiSteps === 1 ? "" : "s"}
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700">
              {flowSummary.templateSteps} free template step
              {flowSummary.templateSteps === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">
              AI replies use credits. Template replies are free.
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Choose the reply mode inside each message step so everyone can see
              what costs credits before the automation goes live.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">
              AI Remaining Today: {aiRemaining}
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700">
              Extra Credits: {addonCredits}
            </span>
          </div>
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

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 sm:space-y-4">
        {steps.map((step, index) => (
          <div key={step.id} className="relative">
            <AutomationStep
              step={step}
              index={index}
              total={steps.length}
              aiDisabled={aiDisabled}
              aiRemaining={aiRemaining}
              addonCredits={addonCredits}
              onDelete={() => removeStep(step.id)}
              onMoveUp={() => moveStep(index, "up")}
              onMoveDown={() => moveStep(index, "down")}
              onConfigChange={(key: string, value: string | number) =>
                updateConfig(step.id, key, value)
              }
            />

            {index !== steps.length - 1 ? (
              <div className="flex justify-center py-2">
                <div className="h-6 w-px rounded-full bg-gradient-to-b from-blue-200 to-cyan-200" />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="shrink-0 rounded-[22px] border border-dashed border-slate-300 bg-slate-50 p-3 sm:p-4">
        <p className="text-sm font-semibold text-slate-800">Add Another Step</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Message steps send the reply. Delay, condition, and booking steps let
          you control the path after that.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ["MESSAGE", "Message"],
              ["DELAY", "Delay"],
              ["CONDITION", "Condition"],
              ["BOOKING", "Booking"],
            ] as Array<[AutomationStepType, string]>
          ).map(([type, label]) => (
            <button
              key={type}
              type="button"
              onClick={() => addStep(type)}
              className={getStepButtonClass(allowedSteps.includes(type))}
            >
              <span className="flex flex-col items-center gap-1 text-center">
                <span>{label}</span>
                <span className="text-[11px] font-medium text-current/70">
                  {STEP_DESCRIPTIONS[type]}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
