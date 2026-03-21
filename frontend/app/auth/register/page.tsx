"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { FcGoogle } from "react-icons/fc";
import { Eye, EyeOff } from "lucide-react";

import { registerUser, resendVerification } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [emailSent, setEmailSent] = useState(false);

  const [cooldown, setCooldown] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const mounted = useRef(true);

  /* ======================================
  SAFE CLEANUP
  ====================================== */

  useEffect(() => {
    return () => {
      mounted.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  /* ======================================
  COOLDOWN TIMER
  ====================================== */

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

  /* ======================================
  VALIDATION
  ====================================== */

  const validateEmail = (value: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  /* ======================================
  REGISTER
  ====================================== */

  const handleRegister = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (loading) return;

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName || !cleanEmail || !password) {
      toast.error("Fill all fields");
      return;
    }

    if (!validateEmail(cleanEmail)) {
      toast.error("Enter a valid email");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    try {
      setLoading(true);

      await registerUser(cleanName, cleanEmail, password);

      toast.success("Account created 🎉 Check your email");

      if (mounted.current) setEmailSent(true);
    } catch (err: any) {
      toast.error(err?.message || "Registration failed");
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  /* ======================================
  RESEND VERIFICATION
  ====================================== */

  const handleResendVerification = async () => {
    if (!email) {
      toast.error("Enter email first");
      return;
    }

    if (cooldown > 0) return;

    try {
      await resendVerification(email.trim().toLowerCase());

      toast.success("Verification email sent");

      startCooldown();
    } catch (err: any) {
      toast.error(err?.message || "Failed to resend email");
    }
  };

  /* ======================================
  GOOGLE
  ====================================== */

  const handleGoogleRegister = () => {
    const API = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

    if (!API) {
      toast.error("API URL not configured");
      return;
    }

    window.location.href = `${API}/api/auth/google`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 sm:px-6">
      <div className="w-full max-w-sm sm:max-w-md bg-white border border-gray-200 rounded-2xl shadow-lg p-5 sm:p-6">

        <div className="text-center mb-4">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">
            Sylph AI
          </h1>
        </div>

        {emailSent ? (
          <div className="text-center">

            <div className="mx-auto w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-6">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 6 9-6M21 8v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8"/>
              </svg>
            </div>

            <h2 className="text-lg font-semibold text-gray-900">
              Verify your email
            </h2>

            <p className="text-sm text-gray-500 mt-2">
              We sent a verification link to
            </p>

            <p className="text-sm font-medium text-gray-900 mt-1">
              {email}
            </p>

            <button
              onClick={handleResendVerification}
              disabled={cooldown > 0}
              className="mt-6 w-full bg-blue-600 text-white py-2.5 rounded-lg disabled:opacity-70"
            >
              {cooldown > 0 ? `Wait ${cooldown}s...` : "Resend verification email"}
            </button>

            <Link
              href="/auth/login"
              className="mt-4 block text-blue-600 text-sm"
            >
              Go to login
            </Link>

          </div>
        ) : (
          <>
            <div className="text-center mb-5">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                Create your account
              </h2>
            </div>

            <button
              onClick={handleGoogleRegister}
              className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg py-2.5 hover:bg-gray-50 transition"
            >
              <FcGoogle size={18} />
              <span className="text-sm font-medium text-gray-700">
                Continue with Google
              </span>
            </button>

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400">OR</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <form className="space-y-3" onSubmit={handleRegister}>
              
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border px-3 py-2 rounded-lg"
              />

              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border px-3 py-2 rounded-lg"
              />

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border px-3 py-2 rounded-lg pr-9"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <button
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 rounded-lg"
              >
                {loading ? "Creating..." : "Create account"}
              </button>
            </form>

            <p className="text-xs text-center mt-4">
              <Link href="/auth/login">Login</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}