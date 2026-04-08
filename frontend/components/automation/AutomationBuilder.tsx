"use client";

import { useEffect, useMemo, useState } from "react";
import AutomationStep from "./AutomationStep";

type StepType = "MESSAGE" | "DELAY" | "CONDITION" | "BOOKING";
type StepConfig = {
  message?: string;
  condition?: string;
  delay?: number;
};
type AutomationPayloadStep = {
  type: StepType;
  config: StepConfig;
};

interface Step {
  id: number;
  type: StepType;
  label: string;
  config: StepConfig;
}

export default function AutomationBuilder({
  plan = "BASIC",
  onChange,
}: {
  plan?: "BASIC" | "PRO" | "ELITE";
  onChange?: (steps: AutomationPayloadStep[]) => void;
}) {
  const [steps, setSteps] = useState<Step[]>([
    {
      id: 1,
      type: "MESSAGE",
      label: "Send Message",
      config: { message: "Hi! Welcome 👋" },
    },
  ]);

  const allowedSteps = useMemo(() => {
    if (plan === "BASIC") return ["MESSAGE"];
    if (plan === "PRO") return ["MESSAGE", "DELAY", "CONDITION"];
    return ["MESSAGE", "DELAY", "CONDITION", "BOOKING"];
  }, [plan]);

  const formatSteps = (source: Step[]) =>
    source.map((step) => {
      const cleanConfig: StepConfig = {};

      if (step.config.message) {
        cleanConfig.message = step.config.message.replace("ðŸ‘‹", "").trim();
      }
      if (step.config.condition) cleanConfig.condition = step.config.condition;
      if (step.config.delay) cleanConfig.delay = step.config.delay;

      return {
        type: step.type,
        config: cleanConfig,
      };
    });

  useEffect(() => {
    onChange?.(formatSteps(steps));
  }, [onChange, steps]);

  /* ---------------- UPDATE ---------------- */

  const updateSteps = (newSteps: Step[]) => {
    setSteps(newSteps);
  };

  /* ---------------- ADD STEP ---------------- */

  const addStep = (type: StepType) => {
    if (!allowedSteps.includes(type)) {
      alert(`Upgrade plan to use ${type}`);
      return;
    }

    const newStep: Step = {
      id: Date.now(),
      type,
      label:
        type === "MESSAGE"
          ? "Send Message"
          : type === "DELAY"
          ? "Wait"
          : type === "CONDITION"
          ? "Condition"
          : "Booking",
      config: {},
    };

    updateSteps([...steps, newStep]);
  };

  /* ---------------- DELETE ---------------- */

  const removeStep = (id: number) => {
    updateSteps(steps.filter((s) => s.id !== id));
  };

  /* ---------------- MOVE ---------------- */

  const moveStep = (index: number, direction: "up" | "down") => {
    const newSteps = [...steps];

    const target = direction === "up" ? index - 1 : index + 1;

    if (target < 0 || target >= steps.length) return;

    [newSteps[index], newSteps[target]] = [
      newSteps[target],
      newSteps[index],
    ];

    updateSteps(newSteps);
  };

  /* ---------------- UPDATE CONFIG ---------------- */

  const updateConfig = (
    id: number,
    key: string,
    value: string | number
  ) => {
    const newSteps = steps.map((s) =>
      s.id === id
        ? {
            ...s,
            config: {
              ...s.config,
              [key]: value,
            },
          }
        : s
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

      {/* 🔥 STEPS CONTAINER */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 sm:space-y-4">
        {steps.map((step, i) => (
          <div key={step.id} className="relative">
            
            {/* STEP CARD WRAPPER */}
            <AutomationStep
              step={step}
              onDelete={() => removeStep(step.id)}
              onMoveUp={() => moveStep(i, "up")}
              onMoveDown={() => moveStep(i, "down")}
              onConfigChange={(key: string, value: string | number) =>
                updateConfig(step.id, key, value)
              }
            />

            {/* 🔥 CONNECTOR LINE */}
            {i !== steps.length - 1 && (
              <div className="flex justify-center py-2">
                <div className="h-6 w-px rounded-full bg-gradient-to-b from-blue-200 to-cyan-200" />
              </div>
            )}

          </div>
        ))}
      </div>

      {/* 🔥 ADD STEP BUTTONS */}
      <div className="shrink-0 rounded-[22px] border border-dashed border-slate-300 bg-slate-50 p-3 sm:p-4">
        <p className="text-sm font-semibold text-slate-800">
          Add Another Step
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Expand the flow while keeping the experience simple and clear.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">

        <button
          type="button"
          onClick={() => addStep("MESSAGE")}
          className={getStepButtonClass(allowedSteps.includes("MESSAGE"))}
        >
          Message
        </button>

        <button
          type="button"
          onClick={() => addStep("DELAY")}
          className={getStepButtonClass(allowedSteps.includes("DELAY"))}
        >
          Delay
        </button>

        <button
          type="button"
          onClick={() => addStep("CONDITION")}
          className={getStepButtonClass(allowedSteps.includes("CONDITION"))}
        >
          Condition
        </button>

        <button
          type="button"
          onClick={() => addStep("BOOKING")}
          className={getStepButtonClass(allowedSteps.includes("BOOKING"))}
        >
          Booking
        </button>

        </div>
      </div>
    </div>
  );
}
