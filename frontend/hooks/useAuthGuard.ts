"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { getToken, removeToken } from "@/lib/token"

export default function useAuthGuard(){

const router = useRouter()

useEffect(()=>{

if(typeof window === "undefined") return

const token = getToken()
console.log("guard token:", token)

if(!token){
  router.replace("/auth/login")
  return
}

try{

  if(!token.includes(".")){
    removeToken()
    router.replace("/auth/login")
    return
  }

  const payload = JSON.parse(
    atob(token.split(".")[1])
  )

  if(payload.exp * 1000 < Date.now()){

    removeToken()

    router.replace("/auth/login")

  }

}catch{

  removeToken()

  router.replace("/auth/login")

}
},[router])
}
