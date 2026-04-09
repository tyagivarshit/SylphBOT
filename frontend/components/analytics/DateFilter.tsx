"use client";

export default function DateFilter({ range, setRange }: any) {
  return (
    <div className="flex gap-2 rounded-2xl border border-slate-200/80 bg-white/86 p-1 shadow-sm">
      
      {["7d", "30d", "90d"].map((r) => (
        <button
          key={r}
          onClick={() => setRange(r)}
          className={`rounded-[14px] px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
            range === r
              ? "bg-[linear-gradient(135deg,#081223_0%,#0b2a5b_55%,#1e5eff_100%)] text-white shadow-sm"
              : "text-slate-600 hover:bg-blue-50"
          }`}
        >
          {r}
        </button>
      ))}

    </div>
  );
}
