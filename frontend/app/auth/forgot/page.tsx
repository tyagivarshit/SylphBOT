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

          {sent ? (
            <div className="text-center">

              {/* ICON */}
              <div className="mx-auto w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mb-5">
                <Mail className="text-blue-600" size={22} />
              </div>

              {/* HEADING */}
              <h2 className="text-lg font-bold mb-2 bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                Check your email
              </h2>

              <p className="text-sm text-gray-600">
                If an account exists, we sent a reset link.
              </p>

              {/* BUTTON */}
              <button
                onClick={handleReset}
                disabled={cooldown > 0}
                className="mt-5 w-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-70"
              >
                {cooldown > 0 ? `Wait ${cooldown}s...` : "Resend link"}
              </button>

              <Link
                href="/auth/login"
                className="inline-block mt-5 text-sm text-blue-600 font-medium"
              >
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">

              {/* HEADING */}
              <div className="text-center mb-4">
                <h2 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                  Forgot password?
                </h2>

                <p className="text-xs text-gray-600 mt-1">
                  Enter your email to receive a reset link
                </p>
              </div>

              {/* INPUT */}
              <div className="relative">
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white text-gray-900 border border-gray-200 rounded-xl px-4 py-2.5 pl-10 text-sm placeholder-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
                />

                <Mail
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                />
              </div>

              {/* BUTTON */}
              <button
                type="submit"
                disabled={loading || cooldown > 0}
                className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-70"
              >
                {loading
                  ? "Sending..."
                  : cooldown > 0
                  ? `Wait ${cooldown}s...`
                  : "Send reset link"}
              </button>

              {/* FOOTER */}
              <p className="text-xs text-gray-600 text-center">
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