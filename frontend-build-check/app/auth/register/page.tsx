"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { FcGoogle } from "react-icons/fc";
import { Eye, EyeOff, LockKeyhole, Mail, Sparkles, User2 } from "lucide-react";

import AuthShell from "@/components/brand/AuthShell";
import { buildGoogleAuthUrl, registerUser } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
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

  const validateEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const isStrongPassword = (value: string) =>
    /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/.test(value);

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

    if (!isStrongPassword(password)) {
      toast.error(
        "Use 8+ chars with uppercase, lowercase, and a number"
      );
      return;
    }

    try {
      setLoading(true);

      const res = await registerUser(cleanName, cleanEmail, password);

      if (!res?.success) {
        throw new Error(res?.message || "Registration failed");
      }

      toast.success("Account created. Check your email");

      if (mounted.current) {
        setTimeout(() => {
          router.push(`/auth/login?email=${encodeURIComponent(cleanEmail)}`);
        }, 1500);
      }

    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Registration failed"
      );
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  const handleGoogleRegister = () => {
    if (loading) {
      return;
    }

    window.location.href = buildGoogleAuthUrl(window.location.origin);
  };

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Set up your Automexia account and launch a polished lead-to-revenue operating system that feels consistent with the main brand from day one."
      footer={
        <p className="text-center">
          Already have an account?{" "}
          <Link href="/auth/login" className="brand-text-link">
            Sign in
          </Link>
        </p>
      }
    >
      <div className="brand-note-card flex items-start gap-3">
        <span className="mt-0.5 rounded-2xl bg-blue-100 p-2 text-blue-700">
          <Sparkles size={16} />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Built for premium client-facing automation
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Your account unlocks the same brand language across CRM, inbox,
            automations, and AI-assisted sales workflows.
          </p>
        </div>
      </div>

      <button
        onClick={handleGoogleRegister}
        disabled={loading}
        className="brand-social-button disabled:cursor-not-allowed disabled:opacity-60"
      >
        <FcGoogle size={18} />
        Continue with Google
      </button>

      <div className="brand-divider-label">or create with email</div>

      <form className="space-y-5" onSubmit={handleRegister}>
        <div className="space-y-2">
          <label htmlFor="register-name" className="brand-field-label">
            Full name
          </label>

          <div className="brand-input-shell">
            <User2 size={17} className="brand-input-icon" />
            <input
              id="register-name"
              type="text"
              placeholder="Your name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="register-email" className="brand-field-label">
            Work email
          </label>

          <div className="brand-input-shell">
            <Mail size={17} className="brand-input-icon" />
            <input
              id="register-email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="register-password" className="brand-field-label">
              Password
            </label>
            <span className="text-xs text-slate-400">
              8+ chars, mixed case, number
            </span>
          </div>

          <div className="brand-input-shell">
            <LockKeyhole size={17} className="brand-input-icon" />
            <input
              id="register-password"
              type={showPassword ? "text" : "password"}
              placeholder="Create a strong password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              className="pr-4 text-slate-400 transition hover:text-slate-700"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="brand-button-primary w-full"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
