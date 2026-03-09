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

export async function getRecentLeads(search?: string, stage?: string) {

  let url = "/api/dashboard/leads"
  const params = new URLSearchParams()

  if (search) {
    params.append("search", search)
  }

  if (stage) {
    params.append("stage", stage)
  }

  if (params.toString()) {
    url += `?${params.toString()}`
  }

  const res = await apiFetch(url)

  return res.data

}


/* ===============================
   LEAD DETAIL
================================ */

export async function getLeadDetail(id: string) {

  const res = await apiFetch(`/api/dashboard/leads/${id}`)

  return res.data

}