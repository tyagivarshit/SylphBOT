"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import toast from "react-hot-toast"
import { Eye, EyeOff, Lock } from "lucide-react"

import { resetPassword } from "@/lib/auth"

export default function ResetPasswordPage(){

const params = useSearchParams()

const token = params.get("token")

const [password,setPassword] = useState("")
const [confirm,setConfirm] = useState("")
const [loading,setLoading] = useState(false)
const [success,setSuccess] = useState(false)
const [showPass,setShowPass] = useState(false)
const [showConfirm,setShowConfirm] = useState(false)

const handleReset = async(e?:React.FormEvent)=>{

if(e) e.preventDefault()

if(loading) return

if(!token){
toast.error("Invalid reset link")
return
}

if(password.length < 6){
toast.error("Password must be at least 6 characters")
return
}

if(password !== confirm){
toast.error("Passwords do not match")
return
}

try{

setLoading(true)

await resetPassword(token,password)

setSuccess(true)

toast.success("Password reset successful")

}catch(err:any){

toast.error(err?.message || "Reset failed")

}finally{

setLoading(false)

}

}

return(

<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4 sm:px-6">

<div className="w-full max-w-sm sm:max-w-md bg-white border border-gray-200 rounded-2xl shadow-xl p-6 sm:p-8">

<div className="text-center mb-6">
<h1 className="text-xl font-bold text-gray-900">
Sylph AI
</h1>
</div>

{success ? (

<div className="text-center">

<div className="flex justify-center mb-4">
<div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
<Lock className="text-green-600" size={26}/>
</div>
</div>

<h2 className="text-lg font-semibold text-gray-900">
Password updated
</h2>

<p className="text-sm text-gray-500 mt-2">
Your password has been successfully reset.
You can now login with your new password.
</p>

<Link
href="/auth/login"
className="inline-block mt-6 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition"
>
Go to login
</Link>

</div>

) : (

<form
onSubmit={handleReset}
className="space-y-4"
>

<h2 className="text-lg sm:text-xl font-semibold text-gray-900 text-center">
Reset your password
</h2>

<p className="text-sm text-gray-500 text-center">
Enter a new password for your account
</p>

<div>

<label className="text-xs font-medium text-gray-700">
New password
</label>

<div className="relative mt-1">

<input
type={showPass ? "text":"password"}
placeholder="Enter new password"
value={password}
onChange={(e)=>setPassword(e.target.value)}
className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
/>

<button
type="button"
onClick={()=>setShowPass(!showPass)}
className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
>
{showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
</button>

</div>

</div>

<div>

<label className="text-xs font-medium text-gray-700">
Confirm password
</label>

<div className="relative mt-1">

<input
type={showConfirm ? "text":"password"}
placeholder="Confirm password"
value={confirm}
onChange={(e)=>setConfirm(e.target.value)}
className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
/>

<button
type="button"
onClick={()=>setShowConfirm(!showConfirm)}
className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
>
{showConfirm ? <EyeOff size={16}/> : <Eye size={16}/>}
</button>

</div>

</div>

<button
type="submit"
disabled={loading}
className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold transition disabled:opacity-70"
>

{loading ? "Resetting..." : "Reset password"}

</button>

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