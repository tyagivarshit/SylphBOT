"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { FcGoogle } from "react-icons/fc";
import { Eye, EyeOff } from "lucide-react";

import { registerUser } from "@/lib/auth";

export default function RegisterPage(){

const router = useRouter()

const [name,setName] = useState("")
const [email,setEmail] = useState("")
const [password,setPassword] = useState("")
const [loading,setLoading] = useState(false)
const [showPassword,setShowPassword] = useState(false)

const handleRegister = async()=>{

if(!name || !email || !password){
toast.error("Fill all fields")
return
}

try{

setLoading(true)

const data = await registerUser(name,email,password)

if(data.error){
toast.error(data.error)
return
}

toast.success("Account created 🎉")

router.push("/auth/login")

}catch(err){

toast.error("Server error")

}finally{

setLoading(false)

}

}

const handleGoogleRegister = ()=>{

toast("Google signup coming soon")

}

return(

<div className="min-h-screen flex items-center justify-center bg-gray-50 px-6 overflow-hidden">

<div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-lg p-6">

{/* Logo */}

<div className="text-center mb-4">
<h1 className="text-xl font-bold text-gray-900">
Sylph AI
</h1>
</div>

{/* Heading */}

<div className="text-center mb-5">

<h2 className="text-lg font-semibold text-gray-900">
Create your account
</h2>

<p className="text-xs text-gray-500 mt-1">
Start automating your customer conversations
</p>

</div>

{/* Google signup */}

<button
onClick={handleGoogleRegister}
className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg py-2 hover:bg-gray-50 transition"
>

<FcGoogle size={18}/>

<span className="text-sm font-medium text-gray-700">
Continue with Google
</span>

</button>

{/* Divider */}

<div className="flex items-center gap-3 my-5">

<div className="flex-1 h-px bg-gray-200"/>

<span className="text-xs text-gray-400">
OR
</span>

<div className="flex-1 h-px bg-gray-200"/>

</div>

{/* Form */}

<div className="space-y-3">

{/* Name */}

<div>

<label className="text-xs font-medium text-gray-700">
Full Name
</label>

<input
type="text"
placeholder="John Doe"
value={name}
onChange={(e)=>setName(e.target.value)}
className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
/>

</div>

{/* Email */}

<div>

<label className="text-xs font-medium text-gray-700">
Email
</label>

<input
type="email"
placeholder="you@example.com"
value={email}
onChange={(e)=>setEmail(e.target.value)}
className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
/>

</div>

{/* Password */}

<div>

<label className="text-xs font-medium text-gray-700">
Password
</label>

<div className="relative mt-1">

<input
type={showPassword ? "text" : "password"}
placeholder="Create a strong password"
value={password}
onChange={(e)=>setPassword(e.target.value)}
className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-9 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
/>

<button
type="button"
onClick={()=>setShowPassword(!showPassword)}
className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
>

{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}

</button>

</div>

</div>

{/* Register button */}

<button
onClick={handleRegister}
disabled={loading}
className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 rounded-lg transition"
>

{loading ? "Creating..." : "Create account"}

</button>

</div>

{/* Footer */}

<p className="text-xs text-gray-500 mt-5 text-center">

Already have an account?{" "}

<Link
href="/auth/login"
className="text-blue-600 font-medium hover:underline"
>

Login

</Link>

</p>

</div>

</div>

)

}