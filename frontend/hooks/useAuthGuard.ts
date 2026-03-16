"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export default function useAuthGuard(){

  const router = useRouter()
  const [loading,setLoading] = useState(true)

  useEffect(()=>{

    let mounted = true

    const checkAuth = async()=>{

      try{

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`,
          {
            credentials:"include",
            cache:"no-store"
          }
        )

        if(!res.ok){
          router.replace("/auth/login")
          return
        }

        if(mounted){
          setLoading(false)
        }

      }catch{
        router.replace("/auth/login")
      }

    }

    checkAuth()

    return ()=>{
      mounted = false
    }

  },[router])

  return loading

}