"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

export default function SuccessPage(){

const router = useRouter()
const [show,setShow] = useState(false)
const [loading,setLoading] = useState(true)

useEffect(()=>{

// animation
setTimeout(()=>setShow(true),300)

// 🔥 IMPORTANT: wait for webhook sync
setTimeout(async ()=>{

try{
await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/billing`,{
credentials:"include"
})
}catch(e){
console.error("Billing refresh failed")
}

setLoading(false)

},2000) // 2 sec delay for webhook

},[])

return(

<div className="min-h-screen flex items-center justify-center bg-gray-50">

<div className="bg-white p-8 rounded-xl shadow text-center">

{/* ANIMATED TICK */}

<div className="flex justify-center mb-6">

<div className={`w-20 h-20 rounded-full border-4 border-green-500 flex items-center justify-center
transition-all duration-500 ${show?"scale-100":"scale-0"}`}>

<span className="text-3xl text-green-600">✓</span>

</div>

</div>

<h1 className="text-xl font-semibold">Payment Successful</h1>

<p className="text-sm text-gray-500 mt-2">
{loading ? "Activating your subscription..." : "Your subscription is now active"}
</p>

<button
onClick={()=>router.push("/dashboard")}
disabled={loading}
className="mt-6 w-full bg-blue-600 text-white py-2 rounded disabled:opacity-50"

>

{loading ? "Please wait..." : "Go to Dashboard"} </button>

</div>

</div>

)
}
