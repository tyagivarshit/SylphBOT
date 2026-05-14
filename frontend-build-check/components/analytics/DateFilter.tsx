"use client";

const RANGE_OPTIONS = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "180d", label: "180D" },
] as const;

type DateFilterProps = {
  range: string;
  setRange: (range: string) => void;
};

export default function DateFilter({
  range,
  setRange,
}: DateFilterProps) {
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200/80 bg-white/86 p-1 shadow-sm">
      
      {RANGE_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => setRange(option.value)}
          className={`rounded-[14px] px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
            range === option.value
              ? "bg-[linear-gradient(135deg,#081223_0%,#0b2a5b_55%,#1e5eff_100%)] text-white shadow-sm"
              : "text-slate-600 hover:bg-blue-50"
          }`}
        >
          {option.label}
        </button>
      ))}

    </div>
  );
}
