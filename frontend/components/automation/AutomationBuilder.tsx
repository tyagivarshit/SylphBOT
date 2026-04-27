"use client";

import { useEffect, useMemo, useState } from "react";
import { useUpgrade } from "@/app/(dashboard)/layout";
import { getUsageOverview } from "@/lib/usage.service";
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

const sanitizeStepText = (value?: string | null) =>
  value?.replace("ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¹", "").trim() || "";

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
      metadata.replyMode === "AI" || Boolean(sanitizeStepText(metadata.aiPrompt))
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
        const data = await getUsageOverview();

        if (!mounted || !data) {
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
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">
          {steps.length} {steps.length === 1 ? "step" : "steps"}
        </p>
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
        <p className="text-sm font-semibold text-slate-800">Add step</p>

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
              {label}
            </button>
          ))}
        </div>

        {aiDisabled ? (
          <button
            type="button"
            onClick={openUsageLimitModal}
            className="mt-3 text-sm font-semibold text-rose-700 transition hover:text-rose-800"
          >
            AI replies are unavailable today
          </button>
        ) : null}
      </div>
    </div>
  );
}
