import { useQuery } from "@tanstack/react-query";
import * as api from "./analytics";

export const useOverview = (range: string) => {
  return useQuery({
    queryKey: ["overview", range],
    queryFn: () => api.getOverview(range)
  });
};

export const useCharts = (range: string) => {
  return useQuery({
    queryKey: ["charts", range],
    queryFn: () => api.getCharts(range)
  });
};

export const useFunnel = () => {
  return useQuery({
    queryKey: ["funnel"],
    queryFn: api.getFunnel
  });
};

export const useSources = () => {
  return useQuery({
    queryKey: ["sources"],
    queryFn: api.getSources
  });
};