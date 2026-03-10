"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { apiFetch } from "@/lib/apiClient"

export default function MetaCallback(){

const router = useRouter()

useEffect(()=>{

const params = new URLSearchParams(window.location.search)

const code = params.get("code")

if(!code) return

const connect = async()=>{

try{

await apiFetch("/api/clients/oauth/meta",{
method:"POST",
body:JSON.stringify({ code })
})

router.push("/clients")

}catch(err){

console.error(err)

router.push("/clients")

}

}

connect()

},[])

return(

<div className="flex items-center justify-center h-screen">

Connecting Instagram...

</div>

)

}