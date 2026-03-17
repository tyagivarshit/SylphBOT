"use client"

import { useEffect, useState } from "react"

/* ✅ TYPE DEFINE */
type PlanType = "BASIC" | "PRO" | "ELITE"
type StatusType = "ACTIVE" | "INACTIVE" | "CANCELLED" | "PAST_DUE"

export function usePlan(){

  /* ✅ TYPE FIX */
  const [plan,setPlan] = useState<PlanType>("BASIC")
  const [status,setStatus] = useState<StatusType>("INACTIVE")
  const [loading,setLoading] = useState(true)

  useEffect(()=>{

    const fetchBilling = async ()=>{

      try{
        const res = await fetch("/api/billing", {
          credentials: "include"
        })

        const data = await res.json()

        if(data?.subscription){

          /* ✅ SAFE TYPE CAST */
          const planType = data.subscription.plan?.type as PlanType
          const subStatus = data.subscription.status as StatusType

          setPlan(planType || "BASIC")
          setStatus(subStatus || "INACTIVE")
        }

      }catch(e){
        console.error(e)
      }finally{
        setLoading(false)
      }
    }

    fetchBilling()

  },[])

  return { plan, status, loading }
}