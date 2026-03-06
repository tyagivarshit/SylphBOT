"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"

export default function VerifyEmailPage() {

  const params = useSearchParams()

  useEffect(()=>{

    const token = params.get("token")

    if(token){
      fetch(`http://localhost:5000/api/auth/verify-email?token=${token}`)
    }

  },[])

  return (
    <div className="min-h-screen flex items-center justify-center">

      <div className="bg-white border p-8 rounded-xl text-center">

        <h1 className="text-xl font-semibold">
          Email Verified
        </h1>

        <p className="text-gray-500 mt-2">
          You can now login to your account.
        </p>

        <a
          href="/login"
          className="mt-4 inline-block text-blue-600"
        >
          Go to Login
        </a>

      </div>

    </div>
  )
}