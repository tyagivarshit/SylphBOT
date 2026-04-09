"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ArrowLeft, Mail, Send } from "lucide-react";

import AuthShell from "@/components/brand/AuthShell";
import { forgotPassword } from "@/lib/auth";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const validateEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  useEffect(() => {
    if (cooldown <= 0) return;

    timerRef.current = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cooldown]);

  const startCooldown = () => setCooldown(30);

  const handleReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (loading || cooldown > 0) return;

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      toast.error("Enter your email");
      return;
    }

    if (!validateEmail(cleanEmail)) {
      toast.error("Enter a valid email");
      return;
    }

    try {
      setLoading(true);

      const res = await forgotPassword(cleanEmail);

      if (!res.success) {
        throw new Error(
          res.message || "We could not send the reset email right now"
        );
      }

      setSent(true);
      toast.success("If email exists, reset link sent");

      startCooldown();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? err.message
          : "We could not send the reset email right now"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={sent ? "Check your email" : "Forgot password?"}
      subtitle={
        sent
          ? "If the address exists in your workspace, we have sent a reset link so you can securely get back into Automexia."
          : "Enter your account email and we will send a secure reset link to restore access to your workspace."
      }
      footer={
        <p className="text-center">
          Remember your password?{" "}
          <Link href="/auth/login" className="brand-text-link">
            Back to login
          </Link>
        </p>
      }
    >

      {/* 🔥 AUTOMEXA BRAND */}
      {sent ? (
        <div className="space-y-5 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-[24px] bg-blue-50 text-blue-700 shadow-sm">
            <Mail size={24} />
          </div>

          <div className="brand-note-card">
            A reset link has been sent if an account exists for{" "}
            <span className="font-semibold text-slate-900">
              {email || "your email"}
            </span>
            . For security, the message is shown even if the email is not
            registered.
          </div>

          <button
            onClick={handleReset}
            disabled={cooldown > 0}
            className="brand-button-primary w-full"
          >
            {cooldown > 0 ? `Wait ${cooldown}s...` : "Resend link"}
          </button>

          <Link
            href="/auth/login"
            className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-900"
          >
            <ArrowLeft size={15} />
            Back to login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleReset} className="space-y-5">
          <div className="brand-note-card flex items-start gap-3">
            <span className="mt-0.5 rounded-2xl bg-blue-100 p-2 text-blue-700">
              <Send size={16} />
            </span>
            <p className="text-sm leading-6 text-slate-500">
              Reset emails are rate-limited for safety, so repeated requests may
              briefly pause before the next send.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="forgot-email" className="brand-field-label">
              Account email
            </label>

            <div className="brand-input-shell">
              <Mail size={17} className="brand-input-icon" />
              <input
                id="forgot-email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || cooldown > 0}
            className="brand-button-primary w-full"
          >
            {loading
              ? "Sending reset link..."
              : cooldown > 0
                ? `Wait ${cooldown}s...`
                : "Send reset link"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
