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

    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-6">

      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-10 max-w-md w-full text-center">

        <div className="flex justify-center mb-6">

          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">

            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>

          </div>

        </div>

        <h1 className="text-2xl font-bold text-gray-900">
          Email Verified 🎉
        </h1>

        <p className="text-gray-500 mt-3 text-sm">
          Your email has been successfully verified.
          You can now login to your Sylph AI dashboard.
        </p>

        <a
          href="/auth/login"
          className="mt-6 inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition"
        >
          Go to Login
        </a>

      </div>

    </div>

  )

}