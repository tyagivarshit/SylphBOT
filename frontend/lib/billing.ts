import { getToken } from "./token"

const API = process.env.NEXT_PUBLIC_API_URL

/* ===============================
   GET BILLING
================================ */

export async function getBilling(){

  const token = getToken()

  const res = await fetch(`${API}/api/billing`,{
    headers:{
      "Content-Type":"application/json",
      Authorization:`Bearer ${token}`
    }
  })

  if(!res.ok){
    throw new Error("Failed to fetch billing")
  }

  return res.json()

}


/* ===============================
   CREATE STRIPE CHECKOUT
================================ */

export async function createCheckout(plan:string){

  const token = getToken()

  const res = await fetch(`${API}/api/billing/checkout`,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      Authorization:`Bearer ${token}`
    },
    body:JSON.stringify({ plan })
  })

  if(!res.ok){
    throw new Error("Failed to create checkout")
  }

  return res.json()

}