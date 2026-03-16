import { apiFetch } from "./apiClient"

/* ===============================
   DASHBOARD STATS
================================ */

export async function getDashboardStats() {

  const res = await apiFetch("/api/dashboard/stats")

  return res.data

}


/* ===============================
   RECENT LEADS (LIMIT 5)
================================ */

export async function getRecentLeads(search?: string, stage?: string) {

  let url = "/api/dashboard/leads"
  const params = new URLSearchParams()

  params.append("limit", "5")

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


/* ===============================
   UPDATE LEAD STAGE
================================ */

export async function updateLeadStage(id: string, stage: string) {

  const res = await apiFetch(`/api/dashboard/leads/${id}/stage`, {
    method: "PATCH",
    body: JSON.stringify({ stage })
  })

  return res.data

}


/* ===============================
   ACTIVE CONVERSATIONS
================================ */

export async function getActiveConversations() {

  const res = await apiFetch("/api/dashboard/active-conversations")

  return res.data

}