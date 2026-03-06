"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { loginUser } from "@/lib/auth";
import { setToken } from "@/lib/token";

export default function LoginPage() {

  const router = useRouter()

  const [email,setEmail] = useState("")
  const [password,setPassword] = useState("")
  const [loading,setLoading] = useState(false)

  const handleLogin = async()=>{

    if(!email || !password){
      toast.error("Enter email and password")
      return
    }

    try{

      setLoading(true)

      const data = await loginUser(email,password)

      if(data.error){
        toast.error(data.error)
        return
      }

      setToken(data.accessToken)

      toast.success("Login successful 🚀")

      router.push("/dashboard")

    }catch(err){

      toast.error("Server error")

    }finally{

      setLoading(false)

    }

  }

  return(

    <div className="min-h-screen flex items-center justify-center bg-gray-50">

      <div className="bg-white p-10 rounded-2xl shadow-lg w-full max-w-md">

        <h1 className="text-2xl font-bold mb-6">
          Login to Sylph AI
        </h1>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
          className="w-full border rounded-lg px-4 py-3 mb-4"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e)=>setPassword(e.target.value)}
          className="w-full border rounded-lg px-4 py-3 mb-6"
        />

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 rounded-lg"
        >
          {loading ? "Signing in..." : "Login"}
        </button>

        <p className="text-sm text-gray-500 mt-6 text-center">
          Don’t have an account?{" "}
          <Link href="/auth/register" className="text-blue-600">
            Sign up
          </Link>
        </p>

      </div>

    </div>

  )

}