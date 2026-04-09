"use client";

type AutomationStep = {
  stepKey?: string;
  stepType?: string;
  message?: string | null;
  condition?: string | null;
};

type AutomationFlow = {
  id: string;
  name?: string | null;
  triggerValue?: string | null;
  triggerType?: string | null;
  channel?: string | null;
  status?: string | null;
  steps?: AutomationStep[];
};

export default function AutomationFlowCard({
  automation,
}: {
  automation: AutomationFlow;
}) {
  const steps = automation.steps || [];
  const isActive = (automation.status || "").toUpperCase() === "ACTIVE";
  const firstStepWithMessage = steps.find((step) => step.message)?.message;
  const firstCondition = steps.find((step) => step.condition)?.condition;

  return (
    <div className="flex h-full flex-col justify-between rounded-[24px] border border-slate-200/80 bg-white/84 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              {automation.channel || "Instagram"} automation
            </p>
            <h3 className="mt-2 truncate text-base font-semibold text-slate-950">
              {automation.name || "Untitled automation"}
            </h3>
          </div>

          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              isActive
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {isActive ? "ACTIVE" : automation.status || "DRAFT"}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Trigger
            </p>
            <p className="mt-1 break-words text-sm font-medium text-slate-900">
              {automation.triggerValue || "Not configured"}
            </p>
          </div>

          <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Steps
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {steps.length} {steps.length === 1 ? "step" : "steps"}
            </p>
          </div>
        </div>

        <div className="rounded-[20px] border border-blue-100/70 bg-blue-50/65 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
            Preview
          </p>
          <p className="mt-1 break-words text-sm leading-6 text-slate-700">
            {firstStepWithMessage ||
              firstCondition ||
              "Flow is ready to capture and route new conversations."}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-200/70 pt-4 text-sm text-slate-500">
        <span>{automation.triggerType || "Keyword"} flow</span>
        <span className="text-right">
          {steps.map((step) => step.stepType).filter(Boolean).join(" • ") ||
            "Ready"}
        </span>
      </div>
    </div>
  );
}
