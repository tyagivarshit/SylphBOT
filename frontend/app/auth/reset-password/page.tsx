"use client"

export const dynamic = "force-dynamic"
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
    <div className="h-screen overflow-hidden bg-gradient-to-br from-[#f5f9ff] via-white to-[#eef4ff]">

      {/* 🔥 AUTOMEXA BRAND */}
      <div className="fixed top-6 left-6 sm:left-10 z-20">
        <h1
          className="text-3xl sm:text-4xl font-extrabold tracking-wide bg-gradient-to-r from-[#0A1F44] via-[#1E90FF] to-[#00C6FF] bg-clip-text text-transparent"
          style={{ fontFamily: "Orbitron" }}
        >
          Automexa
        </h1>
      </div>

      <div className="h-full flex items-center justify-center px-4">

        <div className="w-full max-w-sm bg-white/70 backdrop-blur-xl border border-blue-100 rounded-3xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.08)]">

          {success ? (

            <div className="text-center">

              {/* ICON */}
              <div className="mx-auto w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mb-5">
                <Lock className="text-blue-600" size={22}/>
              </div>

              {/* HEADING */}
              <h2 className="text-lg font-bold mb-2 bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                Password updated
              </h2>

              <p className="text-sm text-gray-600">
                Your password has been successfully reset.
              </p>

              <Link
                href="/auth/login"
                className="inline-block mt-5 w-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white py-2.5 rounded-xl text-sm font-semibold text-center"
              >
                Go to login
              </Link>

            </div>

          ) : (

            <form onSubmit={handleReset} className="space-y-4">

              {/* HEADING */}
              <div className="text-center mb-4">
                <h2 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                  Reset password
                </h2>
              </div>

              {/* PASSWORD */}
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white text-gray-900 border border-gray-200 rounded-xl px-4 py-2.5 pr-10 text-sm placeholder-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
                />

                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                >
                  {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>

              {/* CONFIRM */}
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  placeholder="Confirm password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full bg-white text-gray-900 border border-gray-200 rounded-xl px-4 py-2.5 pr-10 text-sm placeholder-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
                />

                <button
                  type="button"
                  onClick={() => setShowConfirm(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                >
                  {showConfirm ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>

              {/* BUTTON */}
              <button
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-70"
              >
                {loading ? "Resetting..." : "Reset password"}
              </button>

              {/* FOOTER */}
              <p className="text-xs text-gray-600 text-center">
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