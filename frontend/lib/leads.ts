import { buildApiUrl } from "@/lib/url"
import { getToken } from "./token"

export async function getLeads(){

  const token = getToken()

  if(!token){
    throw new Error("No token found")
  }

  const res = await fetch(buildApiUrl("/dashboard/leads"),{
    method:"GET",
    credentials: "include",
    headers:{
      "Content-Type":"application/json",
      Authorization:`Bearer ${token}`
    }
  })

  if(!res.ok){
    const err = await res.text()
    console.error("Leads fetch error:",err)
    throw new Error("Failed to fetch leads")
  }

  return res.json()

}
