import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { getAnalyticsDashboard, getOverview, getCharts, getFunnel, getSources } from "./analytics";
import { logLoginAnalyticsTimeline } from "./loginAnalyticsTimeline";

const analyticsQueryDefaults = {
  retry: 1,
  retryDelay: 1000,
  refetchOnWindowFocus: false,
  placeholderData: keepPreviousData,
} as const;

export const useAnalyticsDashboard = (range: string) => {
  useEffect(() => {
    logLoginAnalyticsTimeline("ANALYTICS_QUERY_ENABLED", {
      queryKey: ["analytics-dashboard", range],
      range,
      enabled: true,
    });
  }, [range]);

  return useQuery({
    queryKey: ["analytics-dashboard", range],
    queryFn: () => getAnalyticsDashboard(range),
    ...analyticsQueryDefaults,
  });
};

export const useOverview = (range: string) => {
  return useQuery({
    queryKey: ["analytics-overview-compat", range],
    queryFn: () => getOverview(range),
    ...analyticsQueryDefaults,
  });
};

export const useCharts = (range: string) => {
  return useQuery({
    queryKey: ["analytics-charts-compat", range],
    queryFn: () => getCharts(range),
    ...analyticsQueryDefaults,
  });
};

export const useFunnel = (range = "30d") => {
  return useQuery({
    queryKey: ["analytics-funnel-compat", range],
    queryFn: () => getFunnel(range),
    ...analyticsQueryDefaults,
  });
};

export const useSources = (range = "30d") => {
  return useQuery({
    queryKey: ["analytics-sources-compat", range],
    queryFn: () => getSources(range),
    ...analyticsQueryDefaults,
  });
};
