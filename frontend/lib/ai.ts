import { getToken } from "./token"

const API = process.env.NEXT_PUBLIC_API_URL

export async function getAISettings(clientId:string){

  const token = getToken()

  const res = await fetch(`${API}/api/clients/${clientId}`,{
    headers:{
      Authorization:`Bearer ${token}`
    }
  })

  if(!res.ok){
    throw new Error("Failed to fetch AI settings")
  }

  return res.json()

}

export async function updateAISettings(clientId:string,data:any){

  const token = getToken()

  const res = await fetch(`${API}/api/clients/${clientId}`,{
    method:"PUT",
    headers:{
      "Content-Type":"application/json",
      Authorization:`Bearer ${token}`
    },
    body:JSON.stringify(data)
  })

  if(!res.ok){
    throw new Error("Failed to update AI settings")
  }

  return res.json()

}