import { apiFetch } from "./apiClient"

/* ===============================
   🔥 HELPER (SAFE DATA EXTRACTION)
================================ */

function extractData(res: any) {
  if (!res) return null

  // if backend returns { data: ... }
  if ("data" in res) return res.data

  // if backend returns direct object
  return res
}

/* ===============================
   DASHBOARD STATS
================================ */

export async function getDashboardStats() {
  const res = await apiFetch("/api/dashboard/stats")
  return extractData(res) || {}
}

/* ===============================
   RECENT LEADS
================================ */

export async function getRecentLeads(search?: string, stage?: string) {

  let url = "/api/dashboard/leads"
  const params = new URLSearchParams()

  params.append("limit", "5")

  if (search) params.append("search", search)
  if (stage) params.append("stage", stage)

  if (params.toString()) {
    url += `?${params.toString()}`
  }

  const res = await apiFetch(url)
  return extractData(res) || []
}

/* ===============================
   LEAD DETAIL
================================ */

export async function getLeadDetail(id: string) {
  const res = await apiFetch(`/api/dashboard/leads/${id}`)
  return extractData(res) || null
}

/* ===============================
   UPDATE LEAD
================================ */

export async function updateLeadStage(id: string, stage: string) {
  const res = await apiFetch(`/api/dashboard/leads/${id}/stage`, {
    method: "PATCH",
    body: JSON.stringify({ stage }),
  })
  return extractData(res) || null
}

/* ===============================
   ACTIVE CONVERSATIONS
================================ */

export async function getActiveConversations() {
  const res = await apiFetch("/api/dashboard/active-conversations")
  return extractData(res) || []
}