"use client"

export const dynamic = "force-dynamic"
import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import toast from "react-hot-toast"
import { ArrowLeft, CheckCircle2, Mail, ShieldCheck, XCircle } from "lucide-react"

import AuthShell from "@/components/brand/AuthShell"
import { verifyEmail, resendVerification } from "@/lib/auth"

export default function VerifyEmailPage() {

  const params = useSearchParams()
  const token = params.get("token")

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    token ? "loading" : "error"
  )
  const [message, setMessage] = useState(
    token ? "" : "Invalid verification link"
  )
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
    if (!token) {
      return
    }

    const runVerification = async () => {
      try {
        const res = await verifyEmail(token)

        if (!res.success) {
          throw new Error(res.message || "Verification failed")
        }

        if (mounted.current) {
          setStatus("success")
          setMessage("Your email has been successfully verified.")
        }

      } catch (err: unknown) {

        const msg = err instanceof Error ? err.message.toLowerCase() : ""

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

  }, [token])

  const handleResend = async () => {

    if (!email) {
      toast.error("Enter your email")
      return
    }

    if (cooldown > 0) return

    try {
      const res = await resendVerification(email.trim().toLowerCase())

      if (!res.success) {
        throw new Error(res.message || "Unable to resend verification email")
      }

      toast.success("Verification email sent")
      startCooldown()
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Try again later"
      )
    }
  }

  return (
    <AuthShell
      title={
        status === "success"
          ? "Email verified"
          : status === "error"
            ? "Verification failed"
            : "Verifying your email"
      }
      subtitle="We are checking your verification link so your Automexia workspace stays trusted and secure."
      footer={
        <p className="text-center">
          Want to sign in instead?{" "}
          <Link href="/auth/login" className="brand-text-link">
            Back to login
          </Link>
        </p>
      }
    >

      {/* 🔥 AUTOMEXA BRAND */}
      {status === "loading" && (
        <div className="space-y-5 text-center">
          <div className="mx-auto h-10 w-10 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
          <div className="brand-note-card flex items-start gap-3 text-left">
            <span className="mt-0.5 rounded-2xl bg-blue-100 p-2 text-blue-700">
              <ShieldCheck size={16} />
            </span>
            <p className="text-sm leading-6 text-slate-500">
              We are validating your email token so only trusted users can enter
              the workspace.
            </p>
          </div>
        </div>
      )}

      {status === "success" && (
        <div className="space-y-5 text-center">
          <div className="mx-auto flex min-h-16 min-w-16 flex-col items-center justify-center gap-1 rounded-[24px] bg-emerald-50 px-4 text-center text-sm font-semibold text-emerald-600 shadow-sm">
            <CheckCircle2 size={24} />
                Email Verified 🎉
          </div>

          <div className="brand-note-card">{message}</div>

          <Link href="/auth/login" className="brand-button-primary w-full">
            Go to login
          </Link>
        </div>
          )}

      {status === "error" && (
        <div className="space-y-5">
          <div className="mx-auto flex size-16 items-center justify-center rounded-[24px] bg-red-50 text-red-600 shadow-sm">
            <XCircle size={24} />
          </div>

          <div className="brand-note-card text-center">{message}</div>

          <div className="space-y-2">
            <label htmlFor="verify-email" className="brand-field-label">
              Email address
            </label>

            <div className="brand-input-shell">
              <Mail size={17} className="brand-input-icon" />
              <input
                id="verify-email"
                type="email"
                placeholder="Enter your email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <button
            onClick={handleResend}
            disabled={cooldown > 0}
            className="brand-button-primary w-full"
          >
            {cooldown > 0 ? `Wait ${cooldown}s...` : "Resend verification"}
          </button>

          <Link
            href="/auth/login"
            className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-900"
          >
            <ArrowLeft size={15} />
            Back to login
          </Link>
        </div>
      )}

    </AuthShell>
  )
}
