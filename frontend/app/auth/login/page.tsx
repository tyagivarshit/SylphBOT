"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { FcGoogle } from "react-icons/fc";
import { Eye, EyeOff } from "lucide-react";

import { loginUser } from "@/lib/auth";
import { buildApiUrl } from "@/lib/url";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

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

  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/dashboard");
    }
  }, [user, authLoading, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f8ff]">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  const validateEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

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

      if (res?.data?.user) {
        localStorage.setItem("user", JSON.stringify(res.data.user));
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
    window.location.assign(buildApiUrl("/auth/google"));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f5f9ff] via-white to-[#eef4ff]">

      {/* BRAND NAME */}
      <div className="fixed top-6 left-6 sm:left-10 z-20">
        <h1
          className="text-3xl sm:text-4xl font-bold tracking-wider bg-gradient-to-r from-[#0A1F44] via-[#1E90FF] to-[#00C6FF] bg-clip-text text-transparent"
          style={{ fontFamily: "Orbitron" }}
        >
          Automexia AI
        </h1>
      </div>

      <div className="min-h-screen flex items-center justify-center px-4">

        <div className="w-full max-w-md bg-white/70 backdrop-blur-xl border border-blue-100 rounded-3xl p-8 shadow-[0_20px_60px_rgba(0,0,0,0.08)]">

          {/* HEADING */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
              Welcome back
            </h2>
          </div>

          {/* GOOGLE */}
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-xl py-2.5 bg-white hover:shadow-md transition"
          >
            <FcGoogle size={18} />
            <span className="text-sm font-medium text-gray-800">
              Continue with Google
            </span>
          </button>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">OR</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <form className="space-y-5" onSubmit={handleLogin}>

            {/* EMAIL */}
            <div>
              <label className="text-xs font-medium text-gray-700">
                Email
              </label>

              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full mt-1 bg-white text-gray-900 border border-gray-200 rounded-xl px-4 py-2.5 text-sm placeholder-gray-400 focus:ring-2 focus:ring-blue-400 outline-none transition"
              />
            </div>

            {/* PASSWORD */}
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">
                  Password
                </label>

                <Link
                  href="/auth/forgot"
                  className="text-xs text-blue-500 hover:underline"
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
                  className="w-full bg-white text-gray-900 border border-gray-200 rounded-xl px-4 py-2.5 pr-10 text-sm placeholder-gray-400 focus:ring-2 focus:ring-blue-400 outline-none transition"
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
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-sm font-semibold py-2.5 rounded-xl shadow-md hover:shadow-lg transition active:scale-[0.98] disabled:opacity-70"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="text-xs text-gray-600 mt-6 text-center">
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
