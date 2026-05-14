import { useQuery } from "@tanstack/react-query";
import { getAnalyticsDashboard } from "./analytics";

export const useAnalyticsDashboard = (range: string) => {
  return useQuery({
    queryKey: ["analytics-dashboard", range],
    queryFn: () => getAnalyticsDashboard(range),
  });
};

export const useOverview = (range: string) => {
  return useQuery({
    queryKey: ["analytics-overview-compat", range],
    queryFn: async () => (await getAnalyticsDashboard(range)).summary,
  });
};

export const useCharts = (range: string) => {
  return useQuery({
    queryKey: ["analytics-charts-compat", range],
    queryFn: async () => (await getAnalyticsDashboard(range)).trends.series,
  });
};

export const useFunnel = (range = "30d") => {
  return useQuery({
    queryKey: ["analytics-funnel-compat", range],
    queryFn: async () => (await getAnalyticsDashboard(range)).funnel,
  });
};

export const useSources = (range = "30d") => {
  return useQuery({
    queryKey: ["analytics-sources-compat", range],
    queryFn: async () => (await getAnalyticsDashboard(range)).sourcePerformance,
  });
};
