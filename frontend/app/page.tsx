"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function HomePage() {
  const router = useRouter();
  const { user, loading, lifecycleState } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (user) {
      router.replace("/dashboard");
    } else if (
      lifecycleState === "failed_terminal" ||
      lifecycleState === "anonymous"
    ) {
      router.replace("/auth/login");
    }
  }, [lifecycleState, user, loading, router]);

  return null;
}
