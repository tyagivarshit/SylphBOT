"use client";

import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { recordLifecycleEvent } from "@/lib/lifecycleTelemetry";

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_QUERY_RETRIES = 2;
const BASE_BACKOFF_MS = 350;
const MAX_BACKOFF_MS = 4_000;

const readHttpStatus = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return null;
  }

  const candidate = error as { response?: { status?: unknown } };
  const status = Number(candidate.response?.status);
  return Number.isFinite(status) ? status : null;
};

const readErrorCode = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return "";
  }

  const candidate = error as { code?: unknown };
  return String(candidate.code || "").trim().toUpperCase();
};

const shouldRetryQuery = (failureCount: number, error: unknown) => {
  if (failureCount >= MAX_QUERY_RETRIES) {
    return false;
  }

  const status = readHttpStatus(error);
  const code = readErrorCode(error);

  if (status !== null) {
    if (status === 401 || status === 403 || status === 404 || status === 422) {
      return false;
    }

    return RETRYABLE_HTTP_STATUSES.has(status);
  }

  if (code === "ECONNABORTED" || code === "ERR_NETWORK" || code === "ETIMEDOUT") {
    return true;
  }

  return true;
};

const getRetryDelayMs = (attemptIndex: number) => {
  const exponentialDelay = BASE_BACKOFF_MS * 2 ** Math.max(0, attemptIndex - 1);
  const jitter = Math.floor(Math.random() * 140);
  const nextDelay = Math.min(MAX_BACKOFF_MS, exponentialDelay + jitter);

  recordLifecycleEvent("polling_backoff_applied", {
    strategy: "react_query_retry",
    attemptIndex,
    delayMs: nextDelay,
  });

  return nextDelay;
};

export default function ReactQueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: shouldRetryQuery,
            retryDelay: getRetryDelayMs,
            staleTime: 1000 * 30,
            gcTime: 1000 * 60 * 20,
            refetchOnMount: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );

  const showDevtools = process.env.NODE_ENV !== "production";

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {showDevtools ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  );
}

