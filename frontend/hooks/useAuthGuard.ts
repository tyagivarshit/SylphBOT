"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth" // 🔥 use global context

export default function useAuthGuard(){

  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(()=>{

    if(loading) return // 🔥 wait for auth load

    if(!user){
      router.replace("/auth/login")
    }

  },[user,loading,router])

  return loading

}