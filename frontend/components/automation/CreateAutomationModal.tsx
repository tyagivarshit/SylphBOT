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
          triggerValue: trigger.toLowerCase().trim(),
          steps,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || "Failed to create");
      }

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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 overflow-y-auto p-4">
      
      {/* 🔥 MODAL */}
      <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl w-full max-w-2xl p-6 shadow-xl space-y-5">
        
        {/* HEADER */}
        <h2 className="text-xl font-semibold text-gray-800">
          Create Automation 🚀
        </h2>

        {/* ERROR */}
        {error && (
          <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {/* NAME */}
        <div>
          <label className="text-sm font-semibold text-gray-700">
            Automation Name
          </label>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter automation name"
            className="w-full mt-1 bg-white text-gray-900 border border-blue-100 rounded-xl px-4 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
          />
        </div>

        {/* TRIGGER */}
        <div>
          <label className="text-sm font-semibold text-gray-700">
            Trigger Keyword
          </label>

          <input
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            placeholder="Example: hi / price / start"
            className="w-full mt-1 bg-white text-gray-900 border border-blue-100 rounded-xl px-4 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
          />
        </div>

        {/* BUILDER */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">
            Automation Flow
          </p>

          <AutomationBuilder
            plan={plan}
            onChange={(data) => setSteps(data)}
          />
        </div>

        {/* ACTIONS */}
        <div className="flex justify-end gap-3 pt-2">
          
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-800 transition"
          >
            Cancel
          </button>

          <button
            onClick={handleCreate}
            disabled={loading}
            className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white px-5 py-2 rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Automation"}
          </button>

        </div>
      </div>
    </div>
  );
}