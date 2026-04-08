"use client";

import { useEffect, useState } from "react";
import AutomationBuilder from "./AutomationBuilder";

type AutomationStepType = "MESSAGE" | "DELAY" | "CONDITION" | "BOOKING";
type AutomationPayloadStep = {
  type: AutomationStepType;
  config: {
    message?: string;
    condition?: string;
    delay?: number;
  };
};

type CreateAutomationModalProps = {
  open: boolean;
  onClose: () => void;
  plan?: "BASIC" | "PRO" | "ELITE";
};

export default function CreateAutomationModal({
  open,
  onClose,
  plan = "BASIC",
}: CreateAutomationModalProps) {
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [steps, setSteps] = useState<AutomationPayloadStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  /* ---------------- CREATE ---------------- */

  const handleCreate = async () => {
    if (!name.trim() || !trigger.trim()) {
      setError("All fields are required");
      return;
    }

    if (!steps.length) {
      setError("Add at least 1 step");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/automation/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          triggerValue: trigger.toLowerCase().trim(),
          steps,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || "Failed to create");
      }

      setName("");
      setTrigger("");
      setSteps([]);

      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create automation"
      );
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- UI ---------------- */

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-md">
      
      {/* 🔥 MODAL */}
      <div className="flex min-h-full items-center justify-center p-3 sm:p-5">
        <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 shadow-[0_32px_120px_rgba(15,23,42,0.28)]">
        
        {/* HEADER */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7 sm:py-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-600">
              Automation Builder
            </p>
            <h2 className="mt-1 text-[0px] font-semibold text-slate-900 before:text-xl before:content-['Create_Automation'] sm:before:text-2xl">
          Create Automation 🚀
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Build a clean message flow that feels easy to edit on both desktop and mobile.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
            aria-label="Close create automation modal"
          >
            X
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-4 py-4 sm:space-y-5 sm:px-6 sm:py-6">

        {/* ERROR */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* NAME */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <label className="text-sm font-semibold text-slate-700">
            Automation Name
          </label>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter automation name"
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
          />
        </div>

        {/* TRIGGER */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <label className="text-sm font-semibold text-slate-700">
            Trigger Keyword
          </label>

          <input
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            placeholder="Example: hi / price / start"
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
          />
        </div>

        {/* BUILDER */}
        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Flow Editor
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                Automation Flow
              </p>
            </div>

            <p className="text-sm text-slate-500">
              Arrange each step in the order users should experience it.
            </p>
          </div>

          <AutomationBuilder
            plan={plan}
            onChange={(data) => setSteps(data)}
          />
        </div>

        {/* ACTIONS */}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Cancel
          </button>

          <button
            onClick={handleCreate}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:shadow-lg active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create Automation"}
          </button>

        </div>
      </div>
      </div>
    </div>
  );
}
