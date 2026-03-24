"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Mail } from "lucide-react";
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

      await forgotPassword(cleanEmail);

      setSent(true);
      toast.success("If email exists, reset link sent");

      startCooldown();
    } catch {
      toast.success("If email exists, reset link sent");
      startCooldown();
    } finally {
      setLoading(false);
    }
  };

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

          {sent ? (
            <div className="text-center">

              {/* ICON */}
              <div className="mx-auto w-16 h-16 rounded-full bg-[#14E1C1]/10 flex items-center justify-center mb-6">
                <Mail className="text-[#14E1C1]" size={26} />
              </div>

              {/* HEADING */}
              <h2 className="text-xl font-bold mb-2">
                <span className="bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] bg-clip-text text-transparent">
                  Check
                </span>{" "}
                <span className="text-gray-800">your email</span>
              </h2>

              <p className="text-sm text-gray-700">
                If an account exists, we sent a reset link.
              </p>

              {/* BUTTON */}
              <button
                onClick={handleReset}
                disabled={cooldown > 0}
                className="mt-6 w-full bg-gradient-to-r from-[#14E1C1] via-[#3b82f6] to-[#6366f1] text-white py-2.5 rounded-lg disabled:opacity-70"
              >
                {cooldown > 0 ? `Wait ${cooldown}s...` : "Resend link"}
              </button>

              <Link
                href="/auth/login"
                className="inline-block mt-6 text-sm text-blue-600 font-medium"
              >
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">

              {/* HEADING */}
              <div className="text-center mb-6">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                  <span className="bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] bg-clip-text text-transparent">
                    Forgot
                  </span>{" "}
                  <span className="text-gray-800">password?</span>
                </h2>

                <p className="text-sm text-gray-700 mt-2">
                  Enter your email to receive a reset link
                </p>
              </div>

              {/* INPUT */}
              <div>
                <label className="text-xs font-medium text-gray-900">
                  Email
                </label>

                <div className="relative mt-1">
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pl-10 text-sm text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-[#14E1C1] outline-none"
                  />

                  <Mail
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                  />
                </div>
              </div>

              {/* BUTTON */}
              <button
                type="submit"
                disabled={loading || cooldown > 0}
                className="w-full bg-gradient-to-r from-[#14E1C1] via-[#3b82f6] to-[#6366f1] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-70"
              >
                {loading
                  ? "Sending..."
                  : cooldown > 0
                  ? `Wait ${cooldown}s...`
                  : "Send reset link"}
              </button>

              {/* FOOTER */}
              <p className="text-xs text-gray-700 text-center pt-2">
                Remember your password?{" "}
                <Link
                  href="/auth/login"
                  className="text-blue-600 font-medium hover:underline"
                >
                  Login
                </Link>
              </p>

            </form>
          )}

        </div>
      </div>
    </div>
  );
}