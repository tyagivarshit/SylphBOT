"use client";

import { useState, useMemo } from "react";
import AutomationStep from "./AutomationStep";

type StepType = "MESSAGE" | "DELAY" | "CONDITION" | "BOOKING";

interface Step {
  id: number;
  type: StepType;
  label: string;
  config: {
    message?: string;
    condition?: string;
    delay?: number;
  };
}

export default function AutomationBuilder({
  plan = "BASIC",
  onChange,
}: {
  plan?: "BASIC" | "PRO" | "ELITE";
  onChange?: (steps: any[]) => void;
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

  /* ---------------- UPDATE ---------------- */

  const updateSteps = (newSteps: Step[]) => {
    setSteps(newSteps);

    /* 🔥 CLEAN BACKEND FORMAT */
    const formatted = newSteps.map((s) => {
      const cleanConfig: any = {};

      if (s.config.message) cleanConfig.message = s.config.message;
      if (s.config.condition) cleanConfig.condition = s.config.condition;
      if (s.config.delay) cleanConfig.delay = s.config.delay;

      return {
        type: s.type,
        config: cleanConfig,
      };
    });

    onChange?.(formatted);
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

    const target =
      direction === "up" ? index - 1 : index + 1;

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
    value: any
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

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {steps.map((step, i) => (
          <AutomationStep
            key={step.id}
            step={step}
            onDelete={() => removeStep(step.id)}
            onMoveUp={() => moveStep(i, "up")}
            onMoveDown={() => moveStep(i, "down")}
            onConfigChange={(key: string, value: any) =>
              updateConfig(step.id, key, value)
            }
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2 pt-3">
        <button
          onClick={() => addStep("MESSAGE")}
          className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-xl hover:bg-indigo-200"
        >
          + Message
        </button>

        <button
          onClick={() => addStep("DELAY")}
          className="text-xs bg-yellow-100 text-yellow-700 px-3 py-1.5 rounded-xl hover:bg-yellow-200"
        >
          + Delay
        </button>

        <button
          onClick={() => addStep("CONDITION")}
          className="text-xs bg-purple-100 text-purple-700 px-3 py-1.5 rounded-xl hover:bg-purple-200"
        >
          + Condition
        </button>

        <button
          onClick={() => addStep("BOOKING")}
          className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-xl hover:bg-green-200"
        >
          + Booking
        </button>
      </div>
    </div>
  );
}