"use client";

import { useEffect, useState, useCallback } from "react";
import AutomationCard from "./AutomationCard";
import CreateAutomationModal from "./CreateAutomationModal";

export default function AutomationList() {
  const [open, setOpen] = useState(false);
  const [automations, setAutomations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /* ---------------- FETCH ---------------- */

  const fetchAutomations = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/automation/flows");

      if (!res.ok) throw new Error();

      const data = await res.json();

      setAutomations(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setError("Failed to load automations");
    } finally {
      setLoading(false);
    }
  }, []);

  /* ---------------- INIT ---------------- */

  useEffect(() => {
    fetchAutomations();
  }, [fetchAutomations]);

  /* ---------------- UI ---------------- */

  return (
    <div className="space-y-6">

      {/* 🔥 HEADER */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-gray-800">
          Your Automations
        </h2>

        <button
          onClick={() => setOpen(true)}
          className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white px-5 py-2 text-sm rounded-xl shadow-md hover:shadow-lg transition active:scale-[0.98]"
        >
          Create Automation 🚀
        </button>
      </div>

      {/* 🔥 LOADING SKELETON */}
      {loading && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-28 bg-white/70 backdrop-blur-xl border border-blue-100 rounded-2xl animate-pulse shadow-sm"
            />
          ))}
        </div>
      )}

      {/* 🔥 ERROR STATE */}
      {error && (
        <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl p-3 flex justify-between items-center">
          <span>{error}</span>
          <button
            onClick={fetchAutomations}
            className="text-xs font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* 🔥 EMPTY STATE */}
      {!loading && automations.length === 0 && (
        <div className="text-center border border-dashed border-blue-200 rounded-2xl p-10 bg-white/70 backdrop-blur-xl">
          
          <p className="text-sm font-semibold text-gray-900">
            No automations yet 🚀
          </p>

          <p className="text-xs text-gray-500 mt-1">
            Turn messages into leads automatically
          </p>

          <button
            onClick={() => setOpen(true)}
            className="mt-4 bg-gradient-to-r from-blue-600 to-cyan-500 text-white px-4 py-2 text-sm rounded-xl shadow-md hover:shadow-lg transition"
          >
            Create your first automation
          </button>
        </div>
      )}

      {/* 🔥 GRID */}
      {!loading && automations.length > 0 && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {automations.map((a) => (
            <AutomationCard
              key={a.id}
              automation={a}
              onRefresh={fetchAutomations}
            />
          ))}
        </div>
      )}

      {/* 🔥 MODAL */}
      <CreateAutomationModal
        open={open}
        onClose={() => {
          setOpen(false);
          fetchAutomations();
        }}
      />
    </div>
  );
}