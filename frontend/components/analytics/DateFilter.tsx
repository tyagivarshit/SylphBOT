"use client";

export default function DateFilter({ range, setRange }: any) {
  return (
    <div className="flex gap-2">
      {["7d", "30d", "90d"].map((r) => (
        <button
          key={r}
          onClick={() => setRange(r)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
            range === r
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-900 hover:bg-gray-200"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}