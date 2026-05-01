"use client";

import { Suspense, useEffect } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import { buildAppUrl, fetchClientConnectionStatus } from "@/lib/userApi";

const buildSettingsRedirect = (params: Record<string, string>) => {
  const url = new URL(buildAppUrl("/settings"));

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });

  return `${url.pathname}${url.search}`;
};

function MetaCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code") || "";
    const state = searchParams.get("state") || "";
    const platform = (searchParams.get("platform") || "").toLowerCase();

    if (!code || !state) {
      router.replace(
        buildSettingsRedirect({
          integration: "error",
          reason: "oauth_callback_payload_missing",
          platform,
        }) as Route
      );
      return;
    }

    const connect = async () => {
      const response = await apiFetch<{
        platform?: string;
      }>("/api/clients/oauth/meta", {
        method: "POST",
        body: JSON.stringify({ code, state }),
      });

      if (!response.success) {
        router.replace(
          buildSettingsRedirect({
            integration: "error",
            reason: "oauth_connect_failed",
            platform,
          }) as Route
        );
        return;
      }

      await fetchClientConnectionStatus().catch(() => null);

      const connectedPlatform =
        platform || String(response.data?.platform || "").toLowerCase();

      router.replace(
        buildSettingsRedirect({
          integration: "success",
          platform: connectedPlatform,
        }) as Route
      );
    };

    void connect();
  }, [router, searchParams]);

  return (
    <div className="flex h-screen items-center justify-center text-sm text-slate-600">
      Finalizing integration connection...
    </div>
  );
}

export default function MetaCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-sm text-slate-600">
          Finalizing integration connection...
        </div>
      }
    >
      <MetaCallbackContent />
    </Suspense>
  );
}
