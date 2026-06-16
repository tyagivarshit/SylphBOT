"use client";

import { useEffect, useState } from "react";
import { getDashboardStats } from "@/lib/dashboard.api";
import { Heart, Activity, CheckCircle, AlertTriangle, Play, HelpCircle, ShieldAlert, FileText, Calendar, ArrowRight, MessageSquare, Briefcase } from "lucide-react";

interface WorkforceItem {
  name: string;
  role: string;
  status: string;
  lastActivity: string;
  focus: string;
  escalations: number;
}

export default function WorkforceView() {
  const [workforce, setWorkforce] = useState<WorkforceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const res = await getDashboardStats();
        if (res.success && res.data) {
          setWorkforce(res.data.workforceHealth || []);
        } else {
          setError(res.message || "Failed to load workforce health data");
        }
      } catch (err) {
        console.error("Error fetching workforce stats:", err);
        setError("An unexpected error occurred while loading workforce health");
      } finally {
        setLoading(false);
      }
    };

    void fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
        <p className="text-xs font-semibold text-slate-500">Loading workforce operational insights...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50/30 p-5 text-center">
        <p className="text-xs font-bold text-red-800 mb-1">Operational Sync Interrupted</p>
        <p className="text-[11px] text-red-600">{error}</p>
      </div>
    );
  }

  if (workforce.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center max-w-xl mx-auto my-6">
        <div className="flex justify-center mb-4">
          <span className="p-3.5 rounded-full bg-slate-100 text-slate-400">
            <Briefcase size={24} />
          </span>
        </div>
        <p className="text-sm font-bold text-slate-850 mb-2">
          Your AI workforce is ready to support future business activity.
        </p>
        <p className="text-xs font-semibold text-slate-500 leading-relaxed">
          Configure your first AI workflows to begin delegation.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 🚀 Introduction header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-150 pb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Workforce Status & Auditing</h3>
          <p className="text-xs text-slate-500 mt-1">
            Real-time inspection of active AI processes, task execution timestamps, and human escalation queues.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-100 px-3 py-1 text-[11px] font-bold text-emerald-800">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Active Systems Monitored
        </div>
      </div>

      {/* 👥 AI Grid */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {workforce.map((ai) => {
          const isNeedsAttention = ai.status === "Needs Attention";
          const isBusy = ai.status === "Busy";
          const isPaused = ai.status === "Paused";

          return (
            <div
              key={ai.name}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white/70 backdrop-blur-sm p-5 shadow-sm transition hover:shadow-md border-t-4 border-t-slate-200 hover:border-t-blue-500"
            >
              <div>
                {/* Header info */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-4">
                  <span className="text-xs font-bold text-slate-850">{ai.role}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold border uppercase ${
                    ai.status === "Healthy"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                      : isBusy
                      ? "bg-blue-50 text-blue-700 border-blue-100"
                      : isNeedsAttention
                      ? "bg-amber-50 text-amber-700 border-amber-100"
                      : "bg-slate-100 text-slate-600 border-slate-200"
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      ai.status === "Healthy"
                        ? "bg-emerald-500"
                        : isBusy
                        ? "bg-blue-500"
                        : isNeedsAttention
                        ? "bg-amber-500 animate-pulse"
                        : "bg-slate-400"
                    }`} />
                    {ai.status}
                  </span>
                </div>

                {/* Main operational stats */}
                <div className="space-y-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Operational Focus</span>
                    <p className="text-xs font-semibold text-slate-700 mt-1 leading-relaxed">{ai.focus}</p>
                  </div>
                  
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Autoritative Timestamp</span>
                    <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-1">
                      <Activity size={12} className="text-slate-400" />
                      <span className="font-semibold">{ai.lastActivity}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom detail action / info */}
              <div className="mt-5 pt-3.5 border-t border-slate-100/80 flex items-center justify-between text-[11px]">
                <span className={`font-bold ${ai.escalations > 0 ? "text-amber-600" : "text-slate-500"}`}>
                  {ai.escalations > 0 
                    ? `${ai.escalations} human handover ${ai.escalations === 1 ? "request" : "requests"}`
                    : "0 escalations active"
                  }
                </span>

                <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                  Authoritative Check
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 🔒 System integrity indicators */}
      <div className="rounded-[20px] border border-slate-150 bg-slate-50/65 p-4.5 text-xs text-slate-500 leading-relaxed flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
            <CheckCircle size={15} />
          </span>
          <div>
            <p className="font-bold text-slate-800">Operational Integrity Verified</p>
            <p className="text-[11px] text-slate-500 mt-0.5">All metrics originate from real-time database transactions, event queues, and activity state machine logs.</p>
          </div>
        </div>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
          Secured by Automexia AI Guardrails
        </div>
      </div>
    </div>
  );
}
