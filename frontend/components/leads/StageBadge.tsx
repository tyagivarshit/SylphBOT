type Stage = "NEW" | "QUALIFIED" | "WON" | "LOST" | string

export default function StageBadge({ stage }: { stage: Stage }) {
  const colors: Record<string, string> = {
    NEW: "border-blue-200 bg-blue-50 text-blue-700",
    QUALIFIED: "border-amber-200 bg-amber-50 text-amber-700",
    WON: "border-emerald-200 bg-emerald-50 text-emerald-700",
    LOST: "border-rose-200 bg-rose-50 text-rose-600",
  };

  const style = colors[stage] || "border-slate-200 bg-slate-100 text-slate-600";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap ${style}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {stage}
    </span>
  );
}
