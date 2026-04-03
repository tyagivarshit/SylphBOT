"use client";

export default function AutomationStep({
  step,
  onDelete,
  onMoveUp,
  onMoveDown,
  onConfigChange,
}: any) {

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
    <div className="relative bg-white/70 backdrop-blur-xl border border-blue-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all overflow-hidden">

      {/* 🔥 TOP GRADIENT STRIP */}
      <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${getColor()}`} />

      {/* 🔥 HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400">
            {step.type}
          </p>
          <p className="text-sm font-semibold text-gray-900">
            {step.label}
          </p>
        </div>

        <div className="flex items-center gap-2">

          <button
            onClick={onMoveUp}
            className="text-xs px-2 py-1 rounded-md bg-blue-50 text-gray-600 hover:bg-blue-100 transition"
          >
            ↑
          </button>

          <button
            onClick={onMoveDown}
            className="text-xs px-2 py-1 rounded-md bg-blue-50 text-gray-600 hover:bg-blue-100 transition"
          >
            ↓
          </button>

          <button
            onClick={onDelete}
            className="text-xs px-2 py-1 rounded-md bg-red-50 text-red-500 hover:bg-red-100 transition"
          >
            Delete
          </button>

        </div>
      </div>

      {/* 🔥 CONTENT */}
      <div className="mt-3">

        {/* MESSAGE */}
        {step.type === "MESSAGE" && (
          <textarea
            value={step.config?.message || ""}
            onChange={(e) =>
              onConfigChange("message", e.target.value || "")
            }
            placeholder="Enter message to send..."
            className="w-full text-sm bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
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
            className="w-full text-sm bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 transition"
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
            className="w-full text-sm bg-white border border-blue-100 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 transition"
          />
        )}

        {/* BOOKING */}
        {step.type === "BOOKING" && (
          <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
            User will be asked to book a meeting 📅
          </div>
        )}

      </div>
    </div>
  );
}