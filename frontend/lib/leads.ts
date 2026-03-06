import { getToken } from "./token"

const API = process.env.NEXT_PUBLIC_API_URL

export async function getLeads(){

  const token = getToken()

  const res = await fetch(`${API}/api/dashboard/leads`,{
    headers:{
      Authorization:`Bearer ${token}`
    }
  })

  if(!res.ok){
    throw new Error("Failed to fetch leads")
  }

  return res.json()

}

export async function getLeadDetail(id:string){

  const token = getToken()

  const res = await fetch(`${API}/api/dashboard/leads/${id}`,{
    headers:{
      Authorization:`Bearer ${token}`
    }
  })

  if(!res.ok){
    throw new Error("Failed to fetch lead")
  }

  return res.json()

}