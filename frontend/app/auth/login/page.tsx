"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { FcGoogle } from "react-icons/fc";
import { Eye, EyeOff } from "lucide-react";

import { loginUser } from "@/lib/auth";

export default function LoginPage(){

const router = useRouter();

const [email,setEmail] = useState("");
const [password,setPassword] = useState("");
const [loading,setLoading] = useState(false);
const [showPassword,setShowPassword] = useState(false);
const [checked,setChecked] = useState(false); // 🔥 added

/* ================= SESSION CHECK (FIXED) ================= */

useEffect(()=>{

if(checked) return; // 🔥 prevent multiple calls

const checkSession = async()=>{

try{

const res = await fetch(
`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`,
{
credentials:"include"
}
)

if(res.ok){
router.replace("/dashboard")
}

}catch{}

finally{
setChecked(true); // 🔥 mark done
}

}

checkSession()

},[checked,router])

/* ================= EMAIL VALIDATION ================= */

const validateEmail = (value:string)=>{
return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

/* ================= LOGIN ================= */

const handleLogin = async(e?:React.FormEvent)=>{

if(e) e.preventDefault();

if(loading) return;

const cleanEmail = email.trim();

if(!cleanEmail || !password){
toast.error("Enter email and password");
return;
}

if(!validateEmail(cleanEmail)){
toast.error("Enter a valid email");
return;
}

try{

setLoading(true);

await loginUser(cleanEmail,password);

toast.success("Login successful 🚀");

router.replace("/dashboard");

}catch(err:any){

toast.error(err?.message || "Server error");

}finally{

setLoading(false);

}

};

/* ================= GOOGLE LOGIN (FIXED) ================= */

const handleGoogleLogin = ()=>{

const API = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, ""); // 🔥 safe normalize

if(!API){
toast.error("API URL not configured");
return;
}

window.location.href = `${API}/api/auth/google`;

};

return(

<div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 sm:px-6">

<div className="w-full max-w-sm sm:max-w-md bg-white border border-gray-200 rounded-2xl shadow-lg p-5 sm:p-6">

<div className="text-center mb-4">
<h1 className="text-lg sm:text-xl font-bold text-gray-900">
Sylph AI
</h1>
</div>

<div className="text-center mb-5">

<h2 className="text-base sm:text-lg font-semibold text-gray-900">
Welcome back
</h2>

<p className="text-xs text-gray-500 mt-1">
Sign in to continue to your dashboard
</p>

</div>

<button
onClick={handleGoogleLogin}
className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg py-2.5 hover:bg-gray-50 transition"
>

<FcGoogle size={18}/>

<span className="text-sm font-medium text-gray-700">
Continue with Google
</span>

</button>

<div className="flex items-center gap-3 my-5">

<div className="flex-1 h-px bg-gray-200"/>

<span className="text-xs text-gray-400">
OR
</span>

<div className="flex-1 h-px bg-gray-200"/>

</div>

<form
className="space-y-3"
onSubmit={handleLogin}
>

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

<div>

<div className="flex justify-between mb-1">

<label className="text-xs font-medium text-gray-700">
Password
</label>

<Link
href="/auth/forgot"
className="text-xs text-blue-600 hover:underline"
>
Forgot?
</Link>

</div>

<div className="relative">

<input
type={showPassword ? "text" : "password"}
placeholder="Enter your password"
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

<button
type="submit"
disabled={loading}
className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg transition disabled:opacity-70"
>

{loading ? "Signing in..." : "Sign in"}

</button>

</form>

<p className="text-xs text-gray-500 mt-5 text-center">

Don’t have an account?{" "}

<Link
href="/auth/register"
className="text-blue-600 font-medium hover:underline"
>
Sign up
</Link>

</p>

</div>

</div>

);

}