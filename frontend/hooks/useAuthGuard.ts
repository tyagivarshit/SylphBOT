"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function useAuthGuard() {
  const { user, loading, lifecycleState } = useAuth();
  const router = useRouter();
  const bootstrapActive =
    loading ||
    lifecycleState === "authenticating" ||
    lifecycleState === "session_stabilizing" ||
    lifecycleState === "retrying" ||
    lifecycleState === "authenticated";

  useEffect(() => {
    if (bootstrapActive) return;

    if (
      !user &&
      (lifecycleState === "failed_terminal" || lifecycleState === "anonymous")
    ) {
      router.replace("/auth/login");
    }
  }, [bootstrapActive, lifecycleState, router, user]);

  return {
    user,
    loading: bootstrapActive,
  };
}
