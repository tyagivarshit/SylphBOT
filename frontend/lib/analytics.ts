import { apiFetch } from "./apiClient";

/* ======================================
OVERVIEW
====================================== */
export const getOverview = async (range: string) => {
const res = await apiFetch(`/api/analytics/overview?range=${range}`);
return res.data;
};

/* ======================================
CHARTS
====================================== */
export const getCharts = async (range: string) => {
const res = await apiFetch(`/api/analytics/charts?range=${range}`);
return res.data;
};

/* ======================================
FUNNEL
====================================== */
export const getFunnel = async () => {
const res = await apiFetch(`/api/analytics/funnel`);
return res.data;
};

/* ======================================
SOURCES
====================================== */
export const getSources = async () => {
const res = await apiFetch(`/api/analytics/sources`);
return res.data;
};
