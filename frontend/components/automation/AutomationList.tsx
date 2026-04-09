"use client";

import { useEffect, useState, useCallback } from "react";
import AutomationFlowCard from "./AutomationFlowCard";
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 pb-4">
        <h2 className="text-lg font-semibold text-gray-800">
          Active flows
        </h2>

        <button
          onClick={() => setOpen(true)}
          className="brand-button-primary"
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
              className="h-28 rounded-[24px] border border-slate-200 bg-white/80 animate-pulse shadow-sm"
            />
          ))}
        </div>
      )}

      {/* 🔥 ERROR STATE */}
      {error && (
        <div className="flex items-center justify-between rounded-[22px] border border-red-200 bg-red-50 p-3 text-sm text-red-500">
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
        <div className="brand-empty-state rounded-[24px] p-10 text-center">
          
          <p className="text-sm font-semibold text-gray-900">
            No automations yet 🚀
          </p>

          <p className="text-xs text-gray-500 mt-1">
            Turn messages into leads automatically
          </p>

          <button
            onClick={() => setOpen(true)}
            className="brand-button-primary mt-4"
          >
            Create your first automation
          </button>
        </div>
      )}

      {/* 🔥 GRID */}
      {!loading && automations.length > 0 && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {automations.map((a) => (
            <AutomationFlowCard
              key={a.id}
              automation={a}
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
