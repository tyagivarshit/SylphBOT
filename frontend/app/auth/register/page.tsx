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
/^[^\s@]+@[^\s@]+.[^\s@]+$/.test(value);

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

  if (mounted.current) {
    setEmailSent(true);

    // 🔥 NEW: redirect after short delay
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

const handleGoogleRegister = () => {
const API = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

if (!API) {
  toast.error("API URL not configured");
  return;
}

window.location.href = `${API}/api/auth/google`;

};

return ( <div className="min-h-screen bg-[#f9fcff]">

  <div className="fixed top-5 left-6 sm:left-10 z-20">
    <h1 className="flex items-center text-2xl sm:text-3xl font-bold tracking-[0.25em] font-[Poppins]">
      <span className="text-[#14E1C1]">S</span>
      <span className="text-[#14E1C1]">Y</span>
      <span className="text-gray-800">LPH</span>
    </h1>
  </div>

  <div className="min-h-screen flex items-center justify-center px-4">

    <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-7">

      {emailSent ? (
        <div className="text-center">

          <div className="mx-auto w-16 h-16 rounded-full bg-[#14E1C1]/10 flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-[#14E1C1]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 6 9-6M21 8v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8"/>
            </svg>
          </div>

          <h2 className="text-xl font-bold mb-2">
            <span className="bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] bg-clip-text text-transparent">
              Verify
            </span>{" "}
            <span className="text-gray-800">your email</span>
          </h2>

          <p className="text-sm text-gray-700">
            We sent a link to
          </p>

          <p className="text-sm font-semibold text-gray-900 mt-1">
            {email}
          </p>

          <button
            onClick={handleResendVerification}
            disabled={cooldown > 0}
            className="mt-6 w-full bg-gradient-to-r from-[#14E1C1] via-[#3b82f6] to-[#6366f1] text-white py-2.5 rounded-lg disabled:opacity-70"
          >
            {cooldown > 0 ? `Wait ${cooldown}s...` : "Resend verification email"}
          </button>

          <Link
            href="/auth/login"
            className="mt-4 block text-sm text-blue-600"
          >
            Go to login
          </Link>

        </div>
      ) : (
        <>
          <div className="text-center mb-8">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] bg-clip-text text-transparent">
                Create
              </span>{" "}
              <span className="text-gray-800">account</span>
            </h2>
          </div>

          <button
            onClick={handleGoogleRegister}
            className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg py-2.5 hover:bg-gray-50 transition"
          >
            <FcGoogle size={18} />
            <span className="text-sm font-medium text-gray-900">
              Continue with Google
            </span>
          </button>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-600">OR</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <form className="space-y-4" onSubmit={handleRegister}>

            <input
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-[#14E1C1]"
            />

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-[#14E1C1]"
            />

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-9 text-sm text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-[#14E1C1]"
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
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#14E1C1] via-[#3b82f6] to-[#6366f1] text-white py-2.5 rounded-lg font-semibold"
            >
              {loading ? "Creating..." : "Create account"}
            </button>
          </form>

          <p className="text-xs text-gray-700 mt-6 text-center">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-blue-600 font-medium">
              Login
            </Link>
          </p>
        </>
      )}

    </div>
  </div>
</div>

);
}
