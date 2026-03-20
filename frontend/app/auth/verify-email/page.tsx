"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { verifyEmail, resendVerification } from "@/lib/auth"
import toast from "react-hot-toast"

export default function VerifyEmailPage() {

const params = useSearchParams()

const [status,setStatus] = useState<"loading"|"success"|"error">("loading")
const [message,setMessage] = useState("")
const [resendLoading,setResendLoading] = useState(false)
const [email,setEmail] = useState("") // 🔥 for resend

useEffect(()=>{

const token = params.get("token")

if(!token){
setStatus("error")
setMessage("Invalid verification link")
return
}

const runVerification = async()=>{

try{

const data = await verifyEmail(token)

if(data?.error){
throw new Error(data.error)
}

setStatus("success")
setMessage("Your email has been successfully verified.")

}catch(err:any){

/* 🔥 better UX handling */
if(err?.message?.toLowerCase().includes("expired")){
setMessage("Verification link expired. You can request a new one.")
}else if(err?.message?.toLowerCase().includes("invalid")){
setMessage("Invalid or already used link.")
}else{
setMessage("Verification failed")
}

setStatus("error")

}

}

runVerification()

},[params])

/* 🔥 RESEND (COOLDOWN) */
const handleResend = async()=>{

if(!email){
toast.error("Enter your email")
return
}

if(resendLoading) return

try{

setResendLoading(true)

await resendVerification(email)

toast.success("Verification email sent")

setTimeout(()=>{
setResendLoading(false)
},30000)

}catch{
toast.error("Try again later")
setResendLoading(false)
}

}

return(

<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4 sm:px-6">

<div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-6 sm:p-10 max-w-sm sm:max-w-md w-full text-center">

{status === "loading" && (

<>
<div className="flex justify-center mb-6">
<div className="w-14 h-14 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin"/>
</div>

<h1 className="text-xl font-bold text-gray-900">
Verifying Email...
</h1>
</>

)}

{status === "success" && (

<>
<h1 className="text-xl font-bold text-green-600">
Email Verified 🎉
</h1>

<p className="mt-3 text-sm">{message}</p>

<Link
href="/auth/login"
className="mt-6 inline-block bg-blue-600 text-white px-5 py-2.5 rounded-lg"
>
Go to Login
</Link>
</>

)}

{status === "error" && (

<>
<h1 className="text-xl font-bold text-red-600">
Verification Failed
</h1>

<p className="mt-3 text-sm">{message}</p>

{/* 🔥 RESEND UI */}
<input
type="email"
placeholder="Enter your email"
value={email}
onChange={(e)=>setEmail(e.target.value)}
className="w-full mt-4 border px-3 py-2 rounded-lg"
/>

<button
onClick={handleResend}
disabled={resendLoading}
className="mt-3 w-full bg-blue-600 text-white py-2 rounded-lg disabled:opacity-70"
>
{resendLoading ? "Wait 30s..." : "Resend verification"}
</button>

<Link
href="/auth/login"
className="mt-4 block text-blue-600 text-sm"
>
Back to Login
</Link>
</>

)}

</div>

</div>

)

}