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

  /* ======================================
  CLEANUP
  ====================================== */

  useEffect(() => {
    return () => {
      mounted.current = false
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  /* ======================================
  COOLDOWN TIMER
  ====================================== */

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

  /* ======================================
  VERIFY EMAIL
  ====================================== */

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

  /* ======================================
  RESEND
  ====================================== */

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4 sm:px-6">

      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-6 sm:p-10 max-w-sm sm:max-w-md w-full text-center">

        {status === "loading" && (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-14 h-14 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin"/>
            </div>

            <h1 className="text-xl font-bold text-gray-900">
              Verifying Email...
            </h1>
          </>
        )}

        {status === "success" && (
          <>
            <h1 className="text-xl font-bold text-green-600">
              Email Verified 🎉
            </h1>

            <p className="mt-3 text-sm">{message}</p>

            <Link
              href="/auth/login"
              className="mt-6 inline-block bg-blue-600 text-white px-5 py-2.5 rounded-lg"
            >
              Go to Login
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="text-xl font-bold text-red-600">
              Verification Failed
            </h1>

            <p className="mt-3 text-sm">{message}</p>

            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full mt-4 border px-3 py-2 rounded-lg"
            />

            <button
              onClick={handleResend}
              disabled={cooldown > 0}
              className="mt-3 w-full bg-blue-600 text-white py-2 rounded-lg disabled:opacity-70"
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
  )
}