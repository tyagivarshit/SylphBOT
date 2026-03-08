import { apiFetch } from "./apiClient"

/* ===============================
   DASHBOARD STATS
================================ */

export async function getDashboardStats() {

  const res = await apiFetch("/api/dashboard/stats")

  return res.data

}


/* ===============================
   RECENT LEADS
================================ */

export async function getRecentLeads() {

  const res = await apiFetch("/api/dashboard/leads")

  return res.data

}


/* ===============================
   LEAD DETAIL
================================ */

export async function getLeadDetail(id: string) {

  const res = await apiFetch(`/api/dashboard/leads/${id}`)

  return res.data

}