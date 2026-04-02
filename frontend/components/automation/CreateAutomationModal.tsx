"use client";

import { useState } from "react";
import AutomationBuilder from "./AutomationBuilder";

export default function CreateAutomationModal({
  open,
  onClose,
  plan = "BASIC",
}: any) {
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [steps, setSteps] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  /* ---------------- CREATE ---------------- */

  const handleCreate = async () => {
    if (!name.trim() || !trigger.trim()) {
      setError("All fields are required");
      return;
    }

    if (!steps.length) {
      setError("Add at least 1 step");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/automation/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          triggerValue: trigger.toLowerCase().trim(), // 🔥 FIX
          steps,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || "Failed to create");
      }

      /* RESET */
      setName("");
      setTrigger("");
      setSteps([]);

      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create automation");
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- UI ---------------- */

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl space-y-5 border border-gray-200">
        
        <h2 className="text-lg font-semibold text-gray-900">
          Create Automation 🚀
        </h2>

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        <div>
          <label className="text-sm font-medium text-gray-900">
            Automation Name
          </label>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter automation name"
            className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-900">
            Trigger Keyword
          </label>

          <input
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            placeholder="Example: hi / price / start"
            className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        </div>

        <div>
          <p className="text-sm font-medium text-gray-900 mb-2">
            Automation Flow
          </p>

          <AutomationBuilder
            plan={plan}
            onChange={(data) => setSteps(data)}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>

          <button
            onClick={handleCreate}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-xl text-sm font-medium shadow-md disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Automation"}
          </button>
        </div>
      </div>
    </div>
  );
}