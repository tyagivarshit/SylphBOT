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

  useEffect(() => {
    return () => {
      mounted.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

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

  const validateEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

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

      const res = await registerUser(cleanName, cleanEmail, password);

      if (!res?.success) {
        throw new Error(res?.message || "Registration failed");
      }

      if (res?.data?.user) {
        localStorage.setItem("user", JSON.stringify(res.data.user));
      }

      toast.success("Account created 🎉 Check your email");

      if (mounted.current) {
        setEmailSent(true);

        setTimeout(() => {
          router.push(`/auth/login?email=${encodeURIComponent(cleanEmail)}`);
        }, 1500);
      }

    } catch (err: any) {
      toast.error(err?.message || "Registration failed");
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  const handleGoogleRegister = () => {
    const API = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

    if (!API) {
      toast.error("API URL not configured");
      return;
    }

    window.location.href = `${API}/api/auth/google`;
  };

  return (
    <div className="h-screen sm:h-screen overflow-hidden bg-gradient-to-br from-[#f5f9ff] via-white to-[#eef4ff]">

      {/* BRANDING */}
      <div className="fixed top-6 left-6 sm:left-10 z-20">
        <h1
          className="text-3xl sm:text-4xl font-extrabold tracking-wide bg-gradient-to-r from-[#0A1F44] via-[#1E90FF] to-[#00C6FF] bg-clip-text text-transparent"
          style={{ fontFamily: "Orbitron" }}
        >
          Automexia AI
        </h1>
      </div>

      <div className="h-full flex items-center justify-center px-4">

        <div className="w-full max-w-sm sm:max-w-sm bg-white/70 backdrop-blur-xl border border-blue-100 rounded-3xl p-6 sm:p-6 shadow-[0_20px_60px_rgba(0,0,0,0.08)]">

          {/* HEADING */}
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
              Create account
            </h2>
          </div>

          {/* GOOGLE */}
          <button
            onClick={handleGoogleRegister}
            className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-xl py-2.5 bg-white hover:shadow-md transition"
          >
            <FcGoogle size={18} />
            <span className="text-sm font-medium text-gray-800">
              Continue with Google
            </span>
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">OR</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <form className="space-y-4" onSubmit={handleRegister}>

            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white text-gray-900 border border-gray-200 rounded-xl px-4 py-2.5 text-sm placeholder-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
            />

            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white text-gray-900 border border-gray-200 rounded-xl px-4 py-2.5 text-sm placeholder-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
            />

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white text-gray-900 border border-gray-200 rounded-xl px-4 py-2.5 pr-10 text-sm placeholder-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
              />

              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-sm font-semibold py-2.5 rounded-xl shadow-md hover:shadow-lg transition"
            >
              {loading ? "Creating..." : "Create account"}
            </button>
          </form>

          <p className="text-xs text-gray-600 mt-5 text-center">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-blue-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>

        </div>
      </div>
    </div>
  );
}