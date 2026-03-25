"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { FcGoogle } from "react-icons/fc";
import { Eye, EyeOff } from "lucide-react";

import { loginUser } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext"; // ✅ ADDED

export default function LoginPage() {
const router = useRouter();

const { user, loading: authLoading } = useAuth(); // ✅ ADDED

const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [loading, setLoading] = useState(false);
const [showPassword, setShowPassword] = useState(false);

const mounted = useRef(true);

useEffect(() => {
return () => {
mounted.current = false;
};
}, []);

/* ======================================
🔥 AUTH GUARD (FIXED)
====================================== */

useEffect(() => {
if (!authLoading && user) {
router.replace("/dashboard");
}
}, [user, authLoading, router]);

if (authLoading) {
return ( <div className="min-h-screen flex items-center justify-center bg-[#f9fcff]"> <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" /> </div>
);
}

const validateEmail = (value: string) =>
/^[^\s@]+@[^\s@]+.[^\s@]+$/.test(value);

const handleLogin = async (e?: React.FormEvent) => {
if (e) e.preventDefault();
if (loading) return;

const cleanEmail = email.trim().toLowerCase();

if (!cleanEmail || !password) {
  toast.error("Enter email and password");
  return;
}

if (!validateEmail(cleanEmail)) {
  toast.error("Enter a valid email");
  return;
}

try {
  setLoading(true);

  const res = await loginUser(cleanEmail, password);

  if (!res.success) {
    throw new Error(res.message || "Login failed");
  }

  window.dispatchEvent(new Event("auth:refresh"));
  toast.success("Login successful 🚀");
  router.replace("/dashboard");

} catch (err: any) {
  toast.error(err?.message || "Login failed");
} finally {
  if (mounted.current) setLoading(false);
}

};

const handleGoogleLogin = () => {
const API = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "";

if (!API) {
  toast.error("API URL not configured");
  return;
}

window.location.href = `${API}/api/auth/google`;

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

    {/* 🔥 CARD */}
    <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-7">

      {/* 🔥 HEADING */}
      <div className="text-center mb-8">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] bg-clip-text text-transparent">
            Welcome
          </span>{" "}
          <span className="text-gray-800">back</span>
        </h2>
      </div>

      {/* GOOGLE */}
      <button
        onClick={handleGoogleLogin}
        className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg py-2.5 hover:bg-gray-50 transition"
      >
        <FcGoogle size={18} />
        <span className="text-sm font-medium text-gray-900">
          Continue with Google
        </span>
      </button>

      {/* DIVIDER */}
      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-600">OR</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* FORM */}
      <form className="space-y-4" onSubmit={handleLogin}>

        {/* EMAIL */}
        <div>
          <label className="text-xs font-medium text-gray-900">
            Email
          </label>

          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-[#14E1C1] outline-none"
          />
        </div>

        {/* PASSWORD */}
        <div>
          <div className="flex justify-between mb-1">
            <label className="text-xs font-medium text-gray-900">
              Password
            </label>

            <Link
              href="/auth/forgot"
              className="text-xs text-blue-600 hover:underline"
            >
              Forgot?
            </Link>
          </div>

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-9 text-sm text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-[#14E1C1] outline-none"
            />

            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* BUTTON */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-[#14E1C1] via-[#3b82f6] to-[#6366f1] text-white text-sm font-semibold py-2.5 rounded-lg transition active:scale-[0.98] disabled:opacity-70"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      {/* FOOTER */}
      <p className="text-xs text-gray-700 mt-6 text-center">
        Don’t have an account?{" "}
        <Link
          href="/auth/register"
          className="text-blue-600 font-medium hover:underline"
        >
          Sign up
        </Link>
      </p>

    </div>
  </div>
</div>

);
}
