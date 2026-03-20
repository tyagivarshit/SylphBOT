import * as repo from "../analytics/analytics.repository";
import { getDateRange } from "../utils/analytics.utils";

export const getOverview = async (businessId: string, range: string) => {
  const { start, end } = getDateRange(range);

  const [
    totalLeads,
    messages,
    aiReplies,
    bookings
  ] = await Promise.all([
    repo.countLeads(businessId, start, end),
    repo.countMessages(businessId, start, end),
    repo.countAIReplies(businessId, start, end),
    repo.countBookings(businessId, start, end)
  ]);

  return {
    totalLeads,
    messages,
    aiReplies,
    bookings
  };
};

export const getCharts = async (businessId: string, range: string) => {
  const { start, end } = getDateRange(range);

  const data = await repo.getLeadsGroupedByDate(businessId, start, end);

  return data.map((item: any) => ({
    date: item.date,
    leads: item.count
  }));
};

export const getFunnel = async (businessId: string) => {
  return repo.getFunnelStats(businessId);
};

export const getSources = async (businessId: string) => {
  const data = await repo.getTopSources(businessId);

  return data.map((item: any) => ({
    name: item._id,
    value: item.count
  }));
};