"use client";

import { useEffect, useMemo, useState } from "react";
import AutomationBuilder, {
  type AutomationBuilderStepInput,
  type AutomationPayloadStep,
} from "./AutomationBuilder";
import LoadingButton from "@/components/ui/LoadingButton";
import { notify } from "@/lib/toast";

type AutomationDraft = {
  id: string;
  name?: string | null;
  triggerValue?: string | null;
  triggerType?: string | null;
  channel?: string | null;
  status?: string | null;
  steps?: AutomationBuilderStepInput[];
  createdAt?: string | null;
  updatedAt?: string | null;
  lastTriggeredAt?: string | null;
};

type CreateAutomationModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved?: (automation: AutomationDraft) => void;
  initialData?: AutomationDraft | null;
  plan?: "BASIC" | "PRO" | "ELITE";
};

const mapPayloadStepsToFlowSteps = (steps: AutomationPayloadStep[]) =>
  steps.map((step, index) => ({
    stepKey: `STEP_${index + 1}`,
    stepType: step.type,
    message: step.config.message || null,
    condition: step.config.condition || null,
    nextStep: index < steps.length - 1 ? `STEP_${index + 2}` : null,
    metadata: step.config,
  }));

export default function CreateAutomationModal({
  open,
  onClose,
  onSaved,
  initialData,
  plan = "BASIC",
}: CreateAutomationModalProps) {
  const isEdit = Boolean(initialData?.id);

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [steps, setSteps] = useState<AutomationPayloadStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const modalTitle = isEdit ? "Edit Automation" : "Create Automation";

  const stepChecklist = useMemo(
    () => [
      {
        id: "01",
        title: "Name the automation",
        description: "Give the flow a clear internal name for your team.",
      },
      {
        id: "02",
        title: "Choose the trigger",
        description: "Set the keyword that starts this flow.",
      },
      {
        id: "03",
        title: "Build the reply path",
        description: "Arrange message, delay, condition, and booking steps in order.",
      },
    ],
    []
  );

  useEffect(() => {
    if (!open) {
      setName("");
      setTrigger("");
      setSteps([]);
      setError("");
      setLoading(false);
      return;
    }

    setName(initialData?.name || "");
    setTrigger(initialData?.triggerValue || "");
    setError("");
  }, [initialData, open]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!name.trim() || !trigger.trim()) {
      const message = "Automation name and trigger keyword are required.";
      setError(message);
      return;
    }

    if (!steps.length) {
      const message = "Add at least one step before saving.";
      setError(message);
      return;
    }

    const invalidTemplateStep = steps.find(
      (step) =>
        step.type === "MESSAGE" &&
        step.config.replyMode !== "AI" &&
        !step.config.message?.trim()
    );

    if (invalidTemplateStep) {
      const message = "Add a template reply to every template message step.";
      setError(message);
      return;
    }

    const invalidAIStep = steps.find(
      (step) =>
        step.type === "MESSAGE" &&
        step.config.replyMode === "AI" &&
        !step.config.aiPrompt?.trim() &&
        !step.config.message?.trim()
    );

    if (invalidAIStep) {
      const message = "Add an AI instruction or fallback reply to every AI step.";
      setError(message);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const payload = {
        name: name.trim(),
        triggerValue: trigger.toLowerCase().trim(),
        triggerType: initialData?.triggerType || "KEYWORD",
        channel: initialData?.channel || "INSTAGRAM",
        status: initialData?.status || "ACTIVE",
        steps,
      };

      const response = await fetch(
        isEdit ? `/api/automation/flows/${initialData?.id}` : "/api/automation/flows",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.message ||
            (isEdit ? "Failed to update automation" : "Failed to create automation")
        );
      }

      const savedAutomation: AutomationDraft =
        data?.flow ||
        ({
          id: initialData?.id || data?.id || crypto.randomUUID(),
          ...payload,
          createdAt: initialData?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastTriggeredAt: initialData?.lastTriggeredAt || null,
          steps: mapPayloadStepsToFlowSteps(steps),
        } satisfies AutomationDraft);

      onSaved?.(savedAutomation);
      notify.success(isEdit ? "Automation updated" : "Automation created");
      onClose();
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : isEdit
            ? "Failed to update automation"
            : "Failed to create automation";

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm">
      <div className="flex h-[100dvh] items-center justify-center p-2 sm:p-4">
        <div className="flex h-[min(92dvh,820px)] w-full max-w-6xl flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.26)] sm:h-[min(90dvh,840px)]">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-600">
                Automation Builder
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">
                {modalTitle}
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Create a flow your team can understand at a glance, with clear AI
                credit visibility and full control over each step.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label={isEdit ? "Close edit automation modal" : "Close create automation modal"}
            >
              X
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 bg-slate-50 p-3 xl:grid xl:grid-cols-[320px_minmax(0,1fr)] xl:gap-4 xl:p-4">
            <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:max-h-full xl:grid-cols-1 xl:overflow-y-auto xl:pr-1">
              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 sm:col-span-2 xl:col-span-1">
                  {error}
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-2 xl:col-span-1">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Workflow
                </p>
                <div className="mt-3 space-y-3">
                  {stepChecklist.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
                        {item.id}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {item.title}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {item.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
                <label className="text-sm font-semibold text-slate-700">
                  1. Automation Name
                </label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Example: Instagram pricing follow-up"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
                <label className="text-sm font-semibold text-slate-700">
                  2. Trigger Keyword
                </label>
                <input
                  value={trigger}
                  onChange={(event) => setTrigger(event.target.value)}
                  placeholder="Example: hi / price / start"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                />
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Keep the keyword short and specific so customers can trigger the
                  right flow naturally.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 px-4 py-3 text-white shadow-sm sm:col-span-2 xl:col-span-1">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
                  Plan
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold">{plan}</p>
                  {isEdit ? (
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                      Editing existing flow
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-300">
                  Message steps are available on every plan. Delay, condition, and
                  booking unlock as the plan expands.
                </p>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
              <div className="shrink-0 border-b border-slate-200 px-4 py-3 sm:px-5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                      Step 3
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      Flow Editor
                    </p>
                  </div>

                  <p className="text-sm text-slate-500">
                    Arrange each step in the order your user should experience it.
                  </p>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden px-2.5 py-2.5 sm:px-4 sm:py-3">
                <AutomationBuilder
                  key={initialData?.id || "create-automation-builder"}
                  plan={plan}
                  initialSteps={initialData?.steps}
                  onChange={(data) => setSteps(data)}
                />
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-4">
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Cancel
            </button>

            <LoadingButton
              onClick={handleSubmit}
              loading={loading}
              loadingLabel="Saving..."
              className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isEdit ? "Save Changes" : "Create Automation"}
            </LoadingButton>
          </div>
        </div>
      </div>
    </div>
  );
}
