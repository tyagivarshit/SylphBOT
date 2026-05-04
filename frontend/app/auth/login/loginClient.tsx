"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { FcGoogle } from "react-icons/fc";
import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";

import AuthShell from "@/components/brand/AuthShell";
import { buildGoogleAuthUrl, loginUser } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";

type LoginClientProps = {
  initialEmail: string;
  initialAuthError: string;
};

export default function LoginClient({
  initialEmail,
  initialAuthError,
}: LoginClientProps) {
  const router = useRouter();
  const { user, loading: authLoading, refreshUser } = useAuth();

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<"email" | "google" | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const mounted = useRef(true);
  const handledMessageRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (!initialEmail) {
      return;
    }

    setEmail(initialEmail.trim().toLowerCase());
  }, [initialEmail]);

  useEffect(() => {
    if (
      !initialAuthError ||
      handledMessageRef.current === initialAuthError
    ) {
      return;
    }

    handledMessageRef.current = initialAuthError;

    const messageMap: Record<string, string> = {
      google_auth_failed: "Google sign-in failed. Please try again.",
      oauth_cancelled: "Google sign-in was cancelled. Please try again.",
      oauth_failed: "Google sign-in failed. Please try again.",
      oauth_state_invalid:
        "Your Google sign-in session expired. Please retry.",
      account_inactive: "This account is inactive. Contact support.",
    };

    toast.error(
      messageMap[initialAuthError] ||
        "Sign-in failed. Please try again."
    );
  }, [initialAuthError]);

  const validateEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });

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
      setLoading("email");

      const res = await loginUser(cleanEmail, password);

      if (!res.success) {
        throw new Error(res.message || "Login failed");
      }

      let refreshedUser = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        refreshedUser = await refreshUser();
        if (refreshedUser) {
          break;
        }
        await wait(200 + attempt * 150);
      }

      toast.success("Login successful");
      router.replace("/dashboard");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      if (mounted.current) {
        setLoading(null);
      }
    }
  };

  const handleGoogleLogin = () => {
    if (loading) {
      return;
    }

    try {
      setLoading("google");
      window.location.href = buildGoogleAuthUrl(window.location.origin);
    } catch (error) {
      if (mounted.current) {
        setLoading(null);
      }

      toast.error(
        error instanceof Error
          ? error.message
          : "Google sign-in failed. Please try again."
      );
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your Automexia Lead OS workspace and continue handling conversations, CRM, and automation with the same premium brand experience."
      footer={
        <p className="text-center">
          Don&apos;t have an account?{" "}
          <Link href="/auth/register" className="brand-text-link">
            Create one
          </Link>
        </p>
      }
    >
      <div className="brand-note-card flex items-start gap-3">
        <span className="mt-0.5 rounded-2xl bg-blue-100 p-2 text-blue-700">
          <ShieldCheck size={16} />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Trusted access for your revenue workspace
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Your CRM activity, automations, and AI desk settings stay protected
            behind authenticated workspace access.
          </p>
        </div>
      </div>

      <button
        onClick={handleGoogleLogin}
        disabled={Boolean(loading) || authLoading}
        className="brand-social-button disabled:cursor-not-allowed disabled:opacity-60"
      >
        <FcGoogle size={18} />
        {loading === "google" ? "Redirecting to Google..." : "Continue with Google"}
      </button>

      <div className="brand-divider-label">or sign in with email</div>

      <form className="space-y-5" onSubmit={handleLogin}>
        <div className="space-y-2">
          <label htmlFor="login-email" className="brand-field-label">
            Email
          </label>

          <div className="brand-input-shell">
            <Mail size={17} className="brand-input-icon" />
            <input
              id="login-email"
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
            <label htmlFor="login-password" className="brand-field-label">
              Password
            </label>

            <Link href="/auth/forgot" className="brand-text-link text-xs">
              Forgot password?
            </Link>
          </div>

          <div className="brand-input-shell">
            <LockKeyhole size={17} className="brand-input-icon" />
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="pr-4 text-slate-400 transition hover:text-slate-700"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={Boolean(loading) || authLoading}
          className="brand-button-primary w-full"
        >
          {loading === "email"
            ? "Signing you in..."
            : authLoading
            ? "Checking session..."
            : "Sign in to workspace"}
        </button>
      </form>
    </AuthShell>
  );
}
