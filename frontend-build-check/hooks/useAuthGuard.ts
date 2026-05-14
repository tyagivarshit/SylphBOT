"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function useAuthGuard() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      console.log("🚫 Redirecting to login...");
      router.replace("/auth/login");
    }
  }, [loading, user, router]);

  // 🔥 FIX: return clean structure
  return {
    user,
    loading, // boolean (correct usage)
  };
}