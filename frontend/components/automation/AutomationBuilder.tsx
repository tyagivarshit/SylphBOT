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
    <div className="space-y-6">

      {/* 🔥 STEPS CONTAINER */}
      <div className="space-y-4">
        {steps.map((step, i) => (
          <div key={step.id} className="relative">
            
            {/* STEP CARD WRAPPER */}
            <div className="bg-white/70 backdrop-blur-xl border border-blue-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition">
              <AutomationStep
                step={step}
                onDelete={() => removeStep(step.id)}
                onMoveUp={() => moveStep(i, "up")}
                onMoveDown={() => moveStep(i, "down")}
                onConfigChange={(key: string, value: any) =>
                  updateConfig(step.id, key, value)
                }
              />
            </div>

            {/* 🔥 CONNECTOR LINE */}
            {i !== steps.length - 1 && (
              <div className="flex justify-center my-2">
                <div className="w-px h-6 bg-blue-100" />
              </div>
            )}

          </div>
        ))}
      </div>

      {/* 🔥 ADD STEP BUTTONS */}
      <div className="flex flex-wrap gap-2 pt-2">

        <button
          onClick={() => addStep("MESSAGE")}
          className="text-xs font-semibold bg-gradient-to-r from-blue-600/10 to-cyan-500/10 text-blue-700 px-3 py-1.5 rounded-xl hover:shadow-sm transition"
        >
          + Message
        </button>

        <button
          onClick={() => addStep("DELAY")}
          className="text-xs font-semibold bg-gradient-to-r from-blue-600/10 to-cyan-500/10 text-blue-700 px-3 py-1.5 rounded-xl hover:shadow-sm transition"
        >
          + Delay
        </button>

        <button
          onClick={() => addStep("CONDITION")}
          className="text-xs font-semibold bg-gradient-to-r from-blue-600/10 to-cyan-500/10 text-blue-700 px-3 py-1.5 rounded-xl hover:shadow-sm transition"
        >
          + Condition
        </button>

        <button
          onClick={() => addStep("BOOKING")}
          className="text-xs font-semibold bg-gradient-to-r from-blue-600/10 to-cyan-500/10 text-blue-700 px-3 py-1.5 rounded-xl hover:shadow-sm transition"
        >
          + Booking
        </button>

      </div>
    </div>
  );
}