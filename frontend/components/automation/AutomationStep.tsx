"use client";

type StepType = "MESSAGE" | "DELAY" | "CONDITION" | "BOOKING";
type StepConfig = {
  message?: string;
  condition?: string;
  delay?: number;
};

type AutomationStepProps = {
  step: {
    type: StepType;
    label: string;
    config: StepConfig;
  };
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onConfigChange: (key: string, value: string | number) => void;
};

export default function AutomationStep({
  step,
  onDelete,
  onMoveUp,
  onMoveDown,
  onConfigChange,
}: AutomationStepProps) {

  const getColor = () => {
    switch (step.type) {
      case "MESSAGE":
        return "from-blue-600 to-cyan-500";
      case "DELAY":
        return "from-yellow-500 to-orange-400";
      case "CONDITION":
        return "from-purple-500 to-pink-500";
      case "BOOKING":
        return "from-green-500 to-emerald-400";
      default:
        return "from-blue-600 to-cyan-500";
    }
  };

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white p-3 shadow-sm transition-all hover:shadow-md sm:p-4">

      {/* 🔥 TOP GRADIENT STRIP */}
      <div className={`absolute left-0 top-0 h-1.5 w-full bg-gradient-to-r ${getColor()}`} />

      {/* 🔥 HEADER */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            {step.type}
          </p>
          <p className="mt-2 text-base font-semibold text-slate-900">
            {step.label}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">

          <button
            type="button"
            onClick={onMoveUp}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[0px] text-slate-600 transition before:text-xs before:font-semibold before:content-['Up'] hover:bg-slate-100"
          >
            ↑
          </button>

          <button
            type="button"
            onClick={onMoveDown}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[0px] text-slate-600 transition before:text-xs before:font-semibold before:content-['Down'] hover:bg-slate-100"
          >
            ↓
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

      {/* 🔥 CONTENT */}
      <div className="mt-3 space-y-2">

        {/* MESSAGE */}
        {step.type === "MESSAGE" && (
          <textarea
            rows={3}
            value={(step.config?.message || "").replace("ðŸ‘‹", "").trim()}
            onChange={(e) =>
              onConfigChange("message", e.target.value || "")
            }
            placeholder="Enter message to send..."
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
          />
        )}

        {/* CONDITION */}
        {step.type === "CONDITION" && (
          <input
            value={step.config?.condition || ""}
            onChange={(e) =>
              onConfigChange("condition", e.target.value)
            }
            placeholder="Enter keyword (e.g. price)"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-400 focus:outline-none focus:ring-4 focus:ring-purple-100"
          />
        )}

        {/* DELAY */}
        {step.type === "DELAY" && (
          <input
            type="number"
            value={step.config?.delay || ""}
            onChange={(e) =>
              onConfigChange("delay", Number(e.target.value) || 0)
            }
            placeholder="Delay in seconds"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-yellow-400 focus:outline-none focus:ring-4 focus:ring-yellow-100"
          />
        )}

        {/* BOOKING */}
        {step.type === "BOOKING" && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[0px] text-emerald-700 before:text-sm before:content-['User_will_be_asked_to_book_a_meeting.']">
            User will be asked to book a meeting 📅
          </div>
        )}

      </div>
    </div>
  );
}
