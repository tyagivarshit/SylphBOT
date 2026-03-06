import { getToken, removeToken } from "./token"

const API = process.env.NEXT_PUBLIC_API_URL

export async function apiFetch(url:string,options:any={}){

  const token = getToken()

  const res = await fetch(`${API}${url}`,{

    ...options,

    headers:{
      "Content-Type":"application/json",
      Authorization:`Bearer ${token}`,
      ...(options.headers || {})
    }

  })

  if(res.status === 401){

    removeToken()

    window.location.href="/login"

    return
  }

  return res.json()

}