import { useQuery } from "@tanstack/react-query";
import { getAnalyticsDashboard, getOverview, getCharts, getFunnel, getSources } from "./analytics";

export const useAnalyticsDashboard = (range: string) => {
  return useQuery({
    queryKey: ["analytics-dashboard", range],
    queryFn: () => getAnalyticsDashboard(range),
  });
};

export const useOverview = (range: string) => {
  return useQuery({
    queryKey: ["analytics-overview-compat", range],
    queryFn: () => getOverview(range),
  });
};

export const useCharts = (range: string) => {
  return useQuery({
    queryKey: ["analytics-charts-compat", range],
    queryFn: () => getCharts(range),
  });
};

export const useFunnel = (range = "30d") => {
  return useQuery({
    queryKey: ["analytics-funnel-compat", range],
    queryFn: () => getFunnel(range),
  });
};

export const useSources = (range = "30d") => {
  return useQuery({
    queryKey: ["analytics-sources-compat", range],
    queryFn: () => getSources(range),
  });
};
