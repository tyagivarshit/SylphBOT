"use client"

import { useState } from "react"
import Link from "next/link"
import toast from "react-hot-toast"
import { Mail } from "lucide-react"

export default function ForgotPage(){

const [email,setEmail] = useState("")
const [loading,setLoading] = useState(false)
const [sent,setSent] = useState(false)

const validateEmail = (value:string)=>{
return /^[^\s@]+@[^\s@]+.[^\s@]+$/.test(value)
}

const handleReset = async(e?:React.FormEvent)=>{

if(e) e.preventDefault()

if(loading) return

const cleanEmail = email.trim()

if(!cleanEmail){
toast.error("Enter your email")
return
}

if(!validateEmail(cleanEmail)){
toast.error("Enter a valid email")
return
}

try{

setLoading(true)

/* Replace with API call */

await new Promise((res)=>setTimeout(res,1000))

setSent(true)

toast.success("Reset link sent")

}catch{

toast.error("Failed to send reset link")

}finally{

setLoading(false)

}

}

return(

<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4 sm:px-6">

<div className="w-full max-w-sm sm:max-w-md bg-white border border-gray-200 rounded-2xl shadow-xl p-6 sm:p-8">

{/* Logo */}

<div className="text-center mb-6">

<h1 className="text-xl font-bold text-gray-900">
Sylph AI
</h1>

</div>

{/* Success state */}

{sent ? (

<div className="text-center">

<div className="flex justify-center mb-4">

<div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">

<Mail className="text-green-600" size={26}/>

</div>

</div>

<h2 className="text-lg font-semibold text-gray-900">
Check your email
</h2>

<p className="text-sm text-gray-500 mt-2">
We sent a password reset link to your email.
Please check your inbox.
</p>

<Link
href="/auth/login"
className="inline-block mt-6 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition"
>
Back to login
</Link>

</div>

) : (

<form
onSubmit={handleReset}
className="space-y-4"
>

<h2 className="text-lg sm:text-xl font-semibold text-gray-900 text-center">
Forgot your password?
</h2>

<p className="text-sm text-gray-500 text-center">
Enter your email and we'll send you a reset link
</p>

{/* Email */}

<div>

<label className="text-xs font-medium text-gray-700">
Email address
</label>

<div className="relative mt-1">

<input
type="email"
placeholder="[you@example.com](mailto:you@example.com)"
value={email}
onChange={(e)=>setEmail(e.target.value)}
className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pl-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
/>

<Mail
size={16}
className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
/>

</div>

</div>

{/* Button */}

<button
type="submit"
disabled={loading}
className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold transition disabled:opacity-70"

>

{loading ? "Sending..." : "Send reset link"}

</button>

{/* Footer */}

<p className="text-xs text-gray-500 text-center pt-2">

Remember your password?{" "}

<Link
href="/auth/login"
className="text-blue-600 font-medium hover:underline"
>
Login
</Link>

</p>

</form>

)}

</div>

</div>

)

}
