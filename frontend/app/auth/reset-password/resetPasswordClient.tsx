"use client"

export const dynamic = "force-dynamic"
import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import toast from "react-hot-toast"
import { ArrowLeft, Eye, EyeOff, Lock, LockKeyhole } from "lucide-react"

import AuthShell from "@/components/brand/AuthShell"
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
    return /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/.test(pass)
  }

  const handleReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    if (loading) return

    if (!token) {
      toast.error("Invalid or expired link")
      return
    }

    if (!isStrongPassword(password)) {
      toast.error("Use 8+ chars with uppercase, lowercase & number")
      return
    }

    if (password !== confirm) {
      toast.error("Passwords do not match")
      return
    }

    try {
      setLoading(true)

      const res = await resetPassword(token, password)

      if (!res.success) {
        throw new Error(res.message || "Reset failed")
      }

      if (mounted.current) setSuccess(true)

      toast.success("Password reset successful")

    } catch (err: unknown) {

      const msg = err instanceof Error ? err.message.toLowerCase() : ""

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
    <AuthShell
      title={success ? "Password updated" : "Reset password"}
      subtitle={
        success
          ? "Your workspace password has been updated successfully. You can now sign back in with the new credentials."
          : "Create a strong new password to restore secure access to your Automexia workspace."
      }
      footer={
        <p className="text-center">
          Need to go back?{" "}
          <Link href="/auth/login" className="brand-text-link">
            Return to login
          </Link>
        </p>
      }
    >

      {/* 🔥 AUTOMEXA BRAND */}
      {success ? (
        <div className="space-y-5 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-[24px] bg-blue-50 text-blue-700 shadow-sm">
            <Lock size={24} />
          </div>

          <div className="brand-note-card">
            Your password has been reset. Use your new credentials to continue
            into the dashboard and resume conversations, CRM work, and
            automation tasks.
          </div>

          <Link href="/auth/login" className="brand-button-primary w-full">
            Go to login
          </Link>
        </div>
      ) : (

        <form onSubmit={handleReset} className="space-y-5">
          <div className="brand-note-card">
            Choose a password with uppercase, lowercase, and a number so your
            workspace stays protected.
          </div>

          <div className="space-y-2">
            <label htmlFor="reset-password" className="brand-field-label">
              New password
            </label>

            <div className="brand-input-shell">
              <LockKeyhole size={17} className="brand-input-icon" />
              <input
                id="reset-password"
                type={showPass ? "text" : "password"}
                placeholder="Create a strong password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <button
                type="button"
                onClick={() => setShowPass((value) => !value)}
                className="pr-4 text-slate-400 transition hover:text-slate-700"
                aria-label={showPass ? "Hide password" : "Show password"}
              >
                {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="reset-confirm" className="brand-field-label">
              Confirm password
            </label>

            <div className="brand-input-shell">
              <LockKeyhole size={17} className="brand-input-icon" />
              <input
                id="reset-confirm"
                type={showConfirm ? "text" : "password"}
                placeholder="Repeat your new password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />

              <button
                type="button"
                onClick={() => setShowConfirm((value) => !value)}
                className="pr-4 text-slate-400 transition hover:text-slate-700"
                aria-label={
                  showConfirm ? "Hide confirm password" : "Show confirm password"
                }
              >
                {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <button
            disabled={loading}
            className="brand-button-primary w-full"
          >
            {loading ? "Resetting password..." : "Reset password"}
          </button>

          <Link
            href="/auth/login"
            className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-900"
          >
            <ArrowLeft size={15} />
            Back to login
          </Link>
        </form>
      )}
    </AuthShell>
  )
}
