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

      /* ✅ OPTIONAL (SAFE) */
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

  return (
    <div className="min-h-screen bg-[#f9fcff]">
      {/* UI SAME AS YOUR CODE — NO CHANGE */}
    </div>
  );
}