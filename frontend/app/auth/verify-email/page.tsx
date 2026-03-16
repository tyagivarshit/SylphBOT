"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { verifyEmail } from "@/lib/auth"

export default function VerifyEmailPage() {

const params = useSearchParams()

const [status,setStatus] = useState<"loading"|"success"|"error">("loading")
const [message,setMessage] = useState("")

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

setStatus("error")
setMessage(err?.message || "Verification failed")

}

}

runVerification()

},[params])

return(

<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4 sm:px-6">

<div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-6 sm:p-10 max-w-sm sm:max-w-md w-full text-center">

{status === "loading" && (

<>
<div className="flex justify-center mb-6">
<div className="w-14 h-14 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin"/>
</div>

<h1 className="text-xl sm:text-2xl font-bold text-gray-900">
Verifying Email...
</h1>

<p className="text-gray-500 mt-3 text-sm">
Please wait while we verify your email.
</p>
</>

)}

{status === "success" && (

<>
<div className="flex justify-center mb-6">

<div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-green-100 flex items-center justify-center">

<svg
className="w-7 h-7 sm:w-8 sm:h-8 text-green-600"
fill="none"
stroke="currentColor"
strokeWidth="3"
viewBox="0 0 24 24"
>

<path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>

</svg>

</div>

</div>

<h1 className="text-xl sm:text-2xl font-bold text-gray-900">
Email Verified 🎉
</h1>

<p className="text-gray-500 mt-3 text-sm">
{message}
</p>

<Link
href="/auth/login"
className="mt-6 inline-block bg-blue-600 hover:bg-blue-700 text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium transition"
>
Go to Login
</Link>

</>

)}

{status === "error" && (

<>
<div className="flex justify-center mb-6">

<div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-red-100 flex items-center justify-center">

<svg
className="w-7 h-7 sm:w-8 sm:h-8 text-red-600"
fill="none"
stroke="currentColor"
strokeWidth="3"
viewBox="0 0 24 24"
>

<path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>

</svg>

</div>

</div>

<h1 className="text-xl sm:text-2xl font-bold text-gray-900">
Verification Failed
</h1>

<p className="text-gray-500 mt-3 text-sm">
{message}
</p>

<Link
href="/auth/login"
className="mt-6 inline-block bg-blue-600 hover:bg-blue-700 text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium transition"
>
Back to Login
</Link>

</>

)}

</div>

</div>

)

}