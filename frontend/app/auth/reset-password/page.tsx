"use client"

import { useState, useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import toast from "react-hot-toast"
import { Eye, EyeOff, Lock } from "lucide-react"

import { resetPassword } from "@/lib/auth"

export default function ResetPasswordPage() {

  const params = useSearchParams()
  const token = params.get("token")

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const mounted = useRef(true)

  useEffect(() => {
    return () => {
      mounted.current = false
    }
  }, [])

  const isStrongPassword = (pass: string) => {
    return /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{6,}$/.test(pass)
  }

  const handleReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    if (loading) return

    if (!token) {
      toast.error("Invalid or expired link")
      return
    }

    if (!isStrongPassword(password)) {
      toast.error("Use uppercase, lowercase & number")
      return
    }

    if (password !== confirm) {
      toast.error("Passwords do not match")
      return
    }

    try {
      setLoading(true)

      await resetPassword(token, password)

      if (mounted.current) setSuccess(true)

      toast.success("Password reset successful")

    } catch (err: any) {

      const msg = err?.message?.toLowerCase() || ""

      if (msg.includes("expired")) {
        toast.error("Reset link expired")
      } else if (msg.includes("invalid")) {
        toast.error("Invalid or already used link")
      } else {
        toast.error("Reset failed")
      }

    } finally {
      if (mounted.current) setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f9fcff]">

      {/* 🔥 BRAND */}
      <div className="fixed top-5 left-6 sm:left-10 z-20">
        <h1 className="flex items-center text-2xl sm:text-3xl font-bold tracking-[0.25em] font-[Poppins]">
          <span className="text-[#14E1C1]">S</span>
          <span className="text-[#14E1C1]">Y</span>
          <span className="text-gray-800">LPH</span>
        </h1>
      </div>

      {/* 🔥 CENTER */}
      <div className="min-h-screen flex items-center justify-center px-4">

        <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-7">

          {success ? (

            <div className="text-center">

              {/* ICON */}
              <div className="mx-auto w-16 h-16 rounded-full bg-[#14E1C1]/10 flex items-center justify-center mb-6">
                <Lock className="text-[#14E1C1]" size={26}/>
              </div>

              {/* HEADING */}
              <h2 className="text-xl font-bold mb-2">
                <span className="bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] bg-clip-text text-transparent">
                  Password
                </span>{" "}
                <span className="text-gray-800">updated</span>
              </h2>

              <p className="text-sm text-gray-700">
                Your password has been successfully reset.
              </p>

              <Link
                href="/auth/login"
                className="inline-block mt-6 w-full bg-gradient-to-r from-[#14E1C1] via-[#3b82f6] to-[#6366f1] text-white py-2.5 rounded-lg text-center font-semibold"
              >
                Go to login
              </Link>

            </div>

          ) : (

            <form onSubmit={handleReset} className="space-y-4">

              {/* HEADING */}
              <div className="text-center mb-6">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                  <span className="bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] bg-clip-text text-transparent">
                    Reset
                  </span>{" "}
                  <span className="text-gray-800">password</span>
                </h2>
              </div>

              {/* PASSWORD */}
              <div>
                <label className="text-xs font-medium text-gray-900">
                  New password
                </label>

                <div className="relative mt-1">
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-[#14E1C1] outline-none"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPass(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                  >
                    {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
                  </button>
                </div>
              </div>

              {/* CONFIRM */}
              <div>
                <label className="text-xs font-medium text-gray-900">
                  Confirm password
                </label>

                <div className="relative mt-1">
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-[#14E1C1] outline-none"
                  />

                  <button
                    type="button"
                    onClick={() => setShowConfirm(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                  >
                    {showConfirm ? <EyeOff size={16}/> : <Eye size={16}/>}
                  </button>
                </div>
              </div>

              {/* BUTTON */}
              <button
                disabled={loading}
                className="w-full bg-gradient-to-r from-[#14E1C1] via-[#3b82f6] to-[#6366f1] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-70"
              >
                {loading ? "Resetting..." : "Reset password"}
              </button>

              {/* FOOTER */}
              <p className="text-xs text-gray-700 text-center pt-2">
                Back to{" "}
                <Link
                  href="/auth/login"
                  className="text-blue-600 font-medium hover:underline"
                >
                  login
                </Link>
              </p>

            </form>

          )}

        </div>
      </div>
    </div>
  )
}