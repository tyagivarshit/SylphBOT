"use client";

export default function AutomationStep({
  step,
  onDelete,
  onMoveUp,
  onMoveDown,
  onConfigChange,
}: any) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-3 hover:shadow-md hover:shadow-indigo-500/10 transition-all">
      
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">{step.type}</p>
          <p className="text-sm font-semibold text-gray-900">
            {step.label}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onMoveUp}
            className="text-xs text-gray-500 hover:text-gray-900"
          >
            ↑
          </button>

          <button
            onClick={onMoveDown}
            className="text-xs text-gray-500 hover:text-gray-900"
          >
            ↓
          </button>

          <button
            onClick={onDelete}
            className="text-xs text-red-500 hover:text-red-600"
          >
            Delete
          </button>
        </div>
      </div>

      {/* MESSAGE */}
      {step.type === "MESSAGE" && (
        <textarea
          value={step.config?.message || ""}
          onChange={(e) =>
            onConfigChange("message", e.target.value || "")
          }
          placeholder="Enter message to send..."
          className="w-full text-sm bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
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
          className="w-full text-sm bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
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
          className="w-full text-sm bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500/30"
        />
      )}

      {/* BOOKING */}
      {step.type === "BOOKING" && (
        <div className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          User will be asked to book a meeting 📅
        </div>
      )}
    </div>
  );
}