"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { getToken, removeToken } from "@/lib/token"

export default function useAuthGuard(){

  const router = useRouter()

  useEffect(()=>{

    const token = getToken()

    if(!token){
      router.replace("/login")
      return
    }

    try{

      const payload = JSON.parse(
        atob(token.split(".")[1])
      )

      if(payload.exp * 1000 < Date.now()){

        removeToken()

        router.replace("/login")

      }

    }catch{

      removeToken()

      router.replace("/login")

    }

  },[router])

}