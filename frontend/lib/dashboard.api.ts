import { apiFetch, ApiResponse } from "./apiClient";

/* ======================================
🔥 TYPES (BACKEND ALIGNED)
====================================== */

type DashboardStats = {
  totalLeads: number;
  leadsToday: number;
  leadsThisMonth: number;
  messagesToday: number;

  aiCallsUsed: number;
  aiCallsLimit: number;

  usagePercent: number;
  nearLimit: boolean;
  isUnlimited: boolean;

  plan: string;

  qualifiedLeads?: number;

  chartData: any[];
  messagesChart: any[];
  recentActivity: any[];
};

type LeadsResponse = {
  leads: any[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

/* ======================================
📊 DASHBOARD STATS
====================================== */

export const getDashboardStats = async (): Promise<
  ApiResponse<DashboardStats>
> => {
  return apiFetch<DashboardStats>("/api/dashboard/stats");
};

/* ======================================
👥 RECENT LEADS
====================================== */

export const getRecentLeads = async (): Promise<
  ApiResponse<LeadsResponse>
> => {

  const params = new URLSearchParams();
  params.append("limit", "5");

  const url = `/api/dashboard/leads?${params.toString()}`;

  return apiFetch<LeadsResponse>(url);
};

/* ======================================
🔍 LEAD DETAIL
====================================== */

export const getLeadDetail = async (id: string) => {
  if (!id) {
    throw new Error("Lead ID is required");
  }

  return apiFetch(`/api/dashboard/leads/${id}`);
};

/* ======================================
✏️ UPDATE LEAD STAGE
====================================== */

export const updateLeadStage = async (
  id: string,
  stage: string
) => {

  if (!id || !stage) {
    throw new Error("Lead ID and stage are required");
  }

  return apiFetch(`/api/dashboard/leads/${id}/stage`, {
    method: "PATCH",
    body: JSON.stringify({ stage }),
  });
};

/* ======================================
💬 ACTIVE CONVERSATIONS
====================================== */

export const getActiveConversations = async () => {
  return apiFetch("/api/dashboard/active-conversations");
};