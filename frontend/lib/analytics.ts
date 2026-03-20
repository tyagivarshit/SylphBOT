import axios from "../lib/axios";

export const getOverview = async (range: string) => {
  const { data } = await axios.get(`/analytics/overview?range=${range}`);
  return data.data;
};

export const getCharts = async (range: string) => {
  const { data } = await axios.get(`/analytics/charts?range=${range}`);
  return data.data;
};

export const getFunnel = async () => {
  const { data } = await axios.get(`/analytics/funnel`);
  return data.data;
};

export const getSources = async () => {
  const { data } = await axios.get(`/analytics/sources`);
  return data.data;
};