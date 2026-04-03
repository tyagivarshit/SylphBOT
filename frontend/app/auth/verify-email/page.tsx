"use client"

import { useEffect, useState, useRef } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import toast from "react-hot-toast"
import { verifyEmail, resendVerification } from "@/lib/auth"

export default function VerifyEmailPage() {

  const params = useSearchParams()

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [message, setMessage] = useState("")
  const [email, setEmail] = useState("")
  const [cooldown, setCooldown] = useState(0)

  const mounted = useRef(true)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      mounted.current = false
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return

    timerRef.current = setInterval(() => {
      setCooldown(prev => prev - 1)
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [cooldown])

  const startCooldown = () => setCooldown(30)

  useEffect(() => {

    const token = params.get("token")

    if (!token) {
      setStatus("error")
      setMessage("Invalid verification link")
      return
    }

    const runVerification = async () => {
      try {
        await verifyEmail(token)

        if (mounted.current) {
          setStatus("success")
          setMessage("Your email has been successfully verified.")
        }

      } catch (err: any) {

        const msg = err?.message?.toLowerCase() || ""

        let finalMsg = "Verification failed"

        if (msg.includes("expired")) {
          finalMsg = "Verification link expired. Request a new one."
        } else if (msg.includes("invalid")) {
          finalMsg = "Invalid or already used link."
        }

        if (mounted.current) {
          setStatus("error")
          setMessage(finalMsg)
        }
      }
    }

    runVerification()

  }, [params])

  const handleResend = async () => {

    if (!email) {
      toast.error("Enter your email")
      return
    }

    if (cooldown > 0) return

    try {
      await resendVerification(email.trim().toLowerCase())
      toast.success("Verification email sent")
      startCooldown()
    } catch {
      toast.error("Try again later")
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

        <div className="w-full max-w-sm bg-white/70 backdrop-blur-xl border border-blue-100 rounded-3xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.08)] text-center">

          {status === "loading" && (
            <>
              <div className="flex justify-center mb-5">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/>
              </div>

              <h1 className="text-lg font-bold text-gray-800">
                Verifying Email...
              </h1>
            </>
          )}

          {status === "success" && (
            <>
              <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                Email Verified 🎉
              </h1>

              <p className="mt-3 text-sm text-gray-600">{message}</p>

              <Link
                href="/auth/login"
                className="mt-5 inline-block w-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white py-2.5 rounded-xl text-sm font-semibold"
              >
                Go to Login
              </Link>
            </>
          )}

          {status === "error" && (
            <>
              <h1 className="text-lg font-bold text-red-600">
                Verification Failed
              </h1>

              <p className="mt-3 text-sm text-gray-600">{message}</p>

              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full mt-4 bg-white text-gray-900 border border-gray-200 rounded-xl px-4 py-2.5 text-sm placeholder-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
              />

              <button
                onClick={handleResend}
                disabled={cooldown > 0}
                className="mt-3 w-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-70"
              >
                {cooldown > 0 ? `Wait ${cooldown}s...` : "Resend verification"}
              </button>

              <Link
                href="/auth/login"
                className="mt-4 block text-blue-600 text-sm"
              >
                Back to Login
              </Link>
            </>
          )}

        </div>
      </div>
    </div>
  )
}