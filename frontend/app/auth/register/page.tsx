"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { registerUser } from "@/lib/auth";

export default function RegisterPage(){

  const router = useRouter()

  const [name,setName] = useState("")
  const [email,setEmail] = useState("")
  const [password,setPassword] = useState("")
  const [loading,setLoading] = useState(false)

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

  return(

    <div className="min-h-screen flex items-center justify-center bg-gray-50">

      <div className="bg-white p-10 rounded-2xl shadow-lg w-full max-w-md">

        <h1 className="text-2xl font-bold mb-6">
          Create Account
        </h1>

        <input
          type="text"
          placeholder="Full Name"
          value={name}
          onChange={(e)=>setName(e.target.value)}
          className="w-full border rounded-lg px-4 py-3 mb-4"
        />

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
          onClick={handleRegister}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 rounded-lg"
        >
          {loading ? "Creating..." : "Sign Up"}
        </button>

        <p className="text-sm text-gray-500 mt-6 text-center">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-blue-600">
            Login
          </Link>
        </p>

      </div>

    </div>

  )

}