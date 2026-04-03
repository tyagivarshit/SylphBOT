"use client";

export default function DateFilter({ range, setRange }: any) {
  return (
    <div className="flex gap-2 bg-white/70 backdrop-blur-xl border border-blue-100 p-1 rounded-xl shadow-sm">
      
      {["7d", "30d", "90d"].map((r) => (
        <button
          key={r}
          onClick={() => setRange(r)}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
            range === r
              ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-sm"
              : "text-gray-600 hover:bg-blue-50"
          }`}
        >
          {r}
        </button>
      ))}

    </div>
  );
}