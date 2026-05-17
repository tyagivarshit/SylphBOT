"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function useAuthGuard() {
  const { user, loading, lifecycleState } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (
      !user &&
      (lifecycleState === "failed_terminal" || lifecycleState === "anonymous")
    ) {
      console.log("🚫 Redirecting to login...");
      router.replace("/auth/login");
    }
  }, [lifecycleState, loading, user, router]);

  // 🔥 FIX: return clean structure
  return {
    user,
    loading, // boolean (correct usage)
  };
}
