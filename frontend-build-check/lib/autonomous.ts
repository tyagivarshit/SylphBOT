import { apiFetch } from "./apiClient";

export type AutonomousDashboard = {
  generatedAt: string;
  summary: {
    pending: number;
    queued: number;
    dispatchedToday: number;
    blocked: number;
    avgScore: number;
  };
  engines: Array<{
    engine: string;
    pending: number;
    queued: number;
    blocked: number;
    dispatchedToday: number;
  }>;
  opportunities: Array<{
    leadId: string;
    leadName: string | null;
    engine: string;
    status: string;
    score: number;
    priority: string;
    title: string;
    objective: string;
    summary: string;
    blockedReasons: string[];
    recommendedAt: string;
    nextEligibleAt: string | null;
    updatedAt: string;
  }>;
  campaigns: Array<{
    id: string;
    leadId: string;
    leadName: string | null;
    engine: string;
    status: string;
    title: string;
    objective: string;
    queuedAt: string | null;
    dispatchedAt: string | null;
    failedAt: string | null;
    createdAt: string;
  }>;
  observability: {
    lastSchedulerRunAt: string | null;
    recentEvents: Array<{
      id: string;
      type: string;
      leadId: string | null;
      createdAt: string;
      meta: Record<string, unknown>;
    }>;
    blockedReasons: Array<{
      reason: string;
      count: number;
    }>;
  };
};

export async function getAutonomousDashboard() {
  const response = await apiFetch<AutonomousDashboard>(
    "/api/autonomous/dashboard"
  );

  if (!response.success || !response.data) {
    throw new Error(response.message || "Failed to load autonomous dashboard");
  }

  return response.data;
}

export async function runAutonomousScheduler(autoDispatch = true) {
  const response = await apiFetch<{
    generatedAt: string;
    evaluatedLeads: number;
    queued: number;
    pending: number;
    blocked: number;
    skipped: number;
  }>("/api/autonomous/run", {
    method: "POST",
    body: JSON.stringify({
      autoDispatch,
    }),
  });

  if (!response.success || !response.data) {
    throw new Error(response.message || "Failed to run autonomous scheduler");
  }

  return response.data;
}
