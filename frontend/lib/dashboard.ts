import { apiFetch } from "./apiClient"

/* ===============================
   DASHBOARD STATS
================================ */

export async function getDashboardStats() {

  return apiFetch("/api/dashboard/stats")

}


/* ===============================
   RECENT LEADS
================================ */

export async function getRecentLeads() {

  return apiFetch("/api/dashboard/leads")

}


/* ===============================
   LEAD DETAIL
================================ */

export async function getLeadDetail(id: string) {

  return apiFetch(`/api/dashboard/leads/${id}`)

}