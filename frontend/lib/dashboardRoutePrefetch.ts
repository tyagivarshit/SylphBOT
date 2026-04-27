"use client";

import type { QueryClient } from "@tanstack/react-query";
import { getClients } from "@/lib/clients";
import { api } from "@/lib/api";
import { apiClient } from "@/lib/apiClient";
import * as analyticsApi from "@/lib/analytics";

export const dashboardStatsQueryKey = ["dashboard-stats"] as const;
export const dashboardConversationsQueryKey = [
  "dashboard-active-conversations",
] as const;
export const conversationsQueryKey = ["conversations"] as const;
export const automationFlowsQueryKey = ["automation-flows"] as const;
export const commentTriggersQueryKey = ["comment-triggers"] as const;
export const knowledgeEntriesQueryKey = ["knowledge-base"] as const;
export const clientsQueryKey = ["clients"] as const;
export const bookingListQueryKey = ["booking-list"] as const;
export const analyticsFunnelQueryKey = (range = "30d") =>
  ["analytics-funnel-compat", range] as const;
export const analyticsSourcesQueryKey = (range = "30d") =>
  ["analytics-sources-compat", range] as const;

export const dashboardLeadsQueryKey = (page: number, stage: string) =>
  ["dashboard-leads", page, stage || "ALL"] as const;

export const conversationMessagesQueryKey = (leadId: string) =>
  ["conversation-messages", leadId] as const;

export const availabilityQueryKey = (businessId: string) =>
  ["availability", businessId] as const;

export const analyticsOverviewQueryKey = (range: string) =>
  ["analytics-overview-compat", range] as const;

export const analyticsChartsQueryKey = (range: string) =>
  ["analytics-charts-compat", range] as const;

export async function fetchDashboardStats() {
  const res = await apiClient.get("/dashboard/stats");
  return res.data;
}

export async function fetchDashboardActiveConversations() {
  const res = await apiClient.get("/dashboard/active-conversations");
  return res.data;
}

export async function fetchDashboardLeadsPage(page = 1, stage = "") {
  const res = await apiClient.get("/dashboard/leads", {
    params: {
      page,
      limit: 10,
      stage: stage || undefined,
    },
  });

  return res.data;
}

export async function fetchConversationLeads() {
  const res = await apiClient.get("/conversations");
  return res.data?.conversations || [];
}

export async function fetchConversationMessages(leadId: string) {
  const res = await apiClient.get(`/conversations/${leadId}/messages`);
  return res.data?.messages || [];
}

export async function fetchAutomationFlows() {
  const res = await apiClient.get("/automation/flows");
  return Array.isArray(res.data) ? res.data : res.data?.flows || [];
}

export async function fetchCommentTriggers() {
  const res = await api.get("/api/comment-triggers");
  return Array.isArray(res.data) ? res.data : res.data?.triggers || [];
}

export async function fetchKnowledgeEntries() {
  const res = await api.get("/api/knowledge");
  return res.data.knowledge || [];
}

export async function fetchAvailability(businessId: string) {
  const res = await api.get(`/api/availability/${businessId}`);
  return res.data.availability || [];
}

export async function fetchBookingList() {
  const res = await api.get("/api/booking/list");
  return res.data.bookings || [];
}

export async function prefetchDashboardRoute(
  queryClient: QueryClient,
  href: string,
  businessId?: string | null
) {
  if (href === "/dashboard") {
    await Promise.allSettled([
      queryClient.prefetchQuery({
        queryKey: dashboardStatsQueryKey,
        queryFn: fetchDashboardStats,
      }),
      queryClient.prefetchQuery({
        queryKey: dashboardConversationsQueryKey,
        queryFn: fetchDashboardActiveConversations,
      }),
    ]);
    return;
  }

  if (href === "/leads") {
    await queryClient.prefetchQuery({
      queryKey: dashboardLeadsQueryKey(1, ""),
      queryFn: () => fetchDashboardLeadsPage(1, ""),
    });
    return;
  }

  if (href === "/conversations") {
    await queryClient.prefetchQuery({
      queryKey: conversationsQueryKey,
      queryFn: fetchConversationLeads,
    });
    return;
  }

  if (href === "/automation") {
    await queryClient.prefetchQuery({
      queryKey: automationFlowsQueryKey,
      queryFn: fetchAutomationFlows,
    });
    return;
  }

  if (href === "/comment-automation") {
    await queryClient.prefetchQuery({
      queryKey: commentTriggersQueryKey,
      queryFn: fetchCommentTriggers,
    });
    return;
  }

  if (href === "/knowledge-base") {
    await queryClient.prefetchQuery({
      queryKey: knowledgeEntriesQueryKey,
      queryFn: fetchKnowledgeEntries,
    });
    return;
  }

  if (href === "/booking") {
    const requests = [
      queryClient.prefetchQuery({
        queryKey: bookingListQueryKey,
        queryFn: fetchBookingList,
      }),
    ];

    if (businessId) {
      requests.push(
        queryClient.prefetchQuery({
          queryKey: availabilityQueryKey(businessId),
          queryFn: () => fetchAvailability(businessId),
        })
      );
    }

    await Promise.allSettled(requests);
    return;
  }

  if (href === "/analytics") {
    await Promise.allSettled([
      queryClient.prefetchQuery({
        queryKey: analyticsOverviewQueryKey("7d"),
        queryFn: () => analyticsApi.getOverview("7d"),
      }),
      queryClient.prefetchQuery({
        queryKey: analyticsChartsQueryKey("7d"),
        queryFn: () => analyticsApi.getCharts("7d"),
      }),
      queryClient.prefetchQuery({
        queryKey: analyticsFunnelQueryKey("30d"),
        queryFn: () => analyticsApi.getFunnel("30d"),
      }),
      queryClient.prefetchQuery({
        queryKey: analyticsSourcesQueryKey("30d"),
        queryFn: () => analyticsApi.getSources("30d"),
      }),
    ]);
    return;
  }

  if (href === "/clients") {
    await queryClient.prefetchQuery({
      queryKey: clientsQueryKey,
      queryFn: getClients,
    });
  }
}
