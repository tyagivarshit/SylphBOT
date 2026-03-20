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

/* 🔥 STRONG PASSWORD CHECK */
const isStrongPassword = (pass:string)=>{
return /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{6,}$/.test(pass)
}

const handleReset = async(e?:React.FormEvent)=>{

if(e) e.preventDefault()

if(loading) return

if(!token){
toast.error("Invalid or expired link")
return
}

if(!isStrongPassword(password)){
toast.error("Use uppercase, lowercase & number")
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

/* 🔥 better error UX */
if(err?.message?.toLowerCase().includes("expired")){
toast.error("Reset link expired")
}else if(err?.message?.toLowerCase().includes("invalid")){
toast.error("Invalid or already used link")
}else{
toast.error("Reset failed")
}

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
</p>

<Link
href="/auth/login"
className="inline-block mt-6 bg-blue-600 text-white px-5 py-2.5 rounded-lg"
>
Go to login
</Link>

</div>

) : (

<form onSubmit={handleReset} className="space-y-4">

<h2 className="text-lg font-semibold text-center">
Reset your password
</h2>

<div>

<label className="text-xs">New password</label>

<div className="relative mt-1">

<input
type={showPass ? "text":"password"}
value={password}
onChange={(e)=>setPassword(e.target.value)}
className="w-full border px-3 py-2 rounded-lg pr-10"
/>

<button
type="button"
onClick={()=>setShowPass(!showPass)}
className="absolute right-3 top-2"
>
{showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
</button>

</div>

</div>

<div>

<label className="text-xs">Confirm password</label>

<div className="relative mt-1">

<input
type={showConfirm ? "text":"password"}
value={confirm}
onChange={(e)=>setConfirm(e.target.value)}
className="w-full border px-3 py-2 rounded-lg pr-10"
/>

<button
type="button"
onClick={()=>setShowConfirm(!showConfirm)}
className="absolute right-3 top-2"
>
{showConfirm ? <EyeOff size={16}/> : <Eye size={16}/>}
</button>

</div>

</div>

<button
disabled={loading}
className="w-full bg-blue-600 text-white py-2 rounded-lg"
>
{loading ? "Resetting..." : "Reset password"}
</button>

<p className="text-xs text-center mt-2">
<Link href="/auth/login">Back to login</Link>
</p>

</form>

)}

</div>

</div>

)

}