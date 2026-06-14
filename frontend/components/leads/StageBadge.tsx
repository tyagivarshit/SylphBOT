type Stage = "NEW" | "QUALIFIED" | "WON" | "LOST" | string

const HUMAN_STAGES: Record<string, string> = {
  NEW: "Initial Contact",
  INITIAL_CONTACT: "Initial Contact",
  ONBOARDING_DEMO: "Demo Scheduled",
  QUALIFIED: "Qualified Opportunity",
  NEGOTIATION: "Negotiation",
  WON: "Deal Won",
  CLOSED_WON: "Deal Won",
  LOST: "Deal Lost",
  CLOSED_LOST: "Deal Lost",
}

export default function StageBadge({ stage }: { stage: Stage }) {
  const colors: Record<string, string> = {
    NEW: "border-blue-200 bg-blue-50 text-blue-700",
    INITIAL_CONTACT: "border-blue-200 bg-blue-50 text-blue-700",
    ONBOARDING_DEMO: "border-indigo-200 bg-indigo-50 text-indigo-700",
    QUALIFIED: "border-amber-200 bg-amber-50 text-amber-700",
    NEGOTIATION: "border-orange-200 bg-orange-50 text-orange-700",
    WON: "border-emerald-200 bg-emerald-50 text-emerald-700",
    CLOSED_WON: "border-emerald-200 bg-emerald-50 text-emerald-700",
    LOST: "border-rose-200 bg-rose-50 text-rose-600",
    CLOSED_LOST: "border-rose-200 bg-rose-50 text-rose-600",
  };

  const normalized = (stage || "").toUpperCase();
  const style = colors[normalized] || "border-slate-200 bg-slate-100 text-slate-600";
  const displayLabel = HUMAN_STAGES[normalized] || stage;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap ${style}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {displayLabel}
    </span>
  );
}
