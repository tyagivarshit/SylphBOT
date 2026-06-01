"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  confirmCheckout,
  type CheckoutConfirmLifecycleState,
  type CheckoutConfirmResponse,
} from "@/lib/billing";
import { apiFetch } from "@/lib/apiClient";
import { recordLifecycleEvent } from "@/lib/lifecycleTelemetry";

type BillingPayload = {
  success?: boolean;
  billing?: {
    status?: "INACTIVE" | "ACTIVE" | "TRIAL";
  } | null;
  subscription?: {
    status?: string;
    plan?: {
      name?: string | null;
      type?: string | null;
    } | null;
  } | null;
};

const CHECKOUT_CONFIRM_POLL_WINDOW_MS = 45_000;
const CHECKOUT_CONFIRM_MIN_DELAY_MS = 1_200;
const CHECKOUT_CONFIRM_MAX_DELAY_MS = 4_500;

const sleepWithAbort = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, Math.max(0, Math.floor(ms)));

    const onAbort = () => {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      resolve();
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });

const resolvePollingDelayMs = (
  confirmResult: CheckoutConfirmResponse | null,
  attempt: number
) => {
  const jitter = Math.floor(Math.random() * 180);

  const serverSuggestedMs = Number(confirmResult?.retryAfterMs || 0);
  if (Number.isFinite(serverSuggestedMs) && serverSuggestedMs > 0) {
    const delayMs = Math.max(
      900,
      Math.min(
        CHECKOUT_CONFIRM_MAX_DELAY_MS,
        Math.floor(serverSuggestedMs) + jitter
      )
    );

    recordLifecycleEvent("polling_backoff_applied", {
      area: "checkout_confirmation",
      attempt,
      delayMs,
      source: "server_hint",
    });
    return delayMs;
  }

  const delayMs = Math.min(
    CHECKOUT_CONFIRM_MAX_DELAY_MS,
    CHECKOUT_CONFIRM_MIN_DELAY_MS + attempt * 350 + jitter
  );
  recordLifecycleEvent("polling_backoff_applied", {
    area: "checkout_confirmation",
    attempt,
    delayMs,
    source: "client_backoff",
  });
  return delayMs;
};

const normalizePlanKey = (value?: string | null) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

const getResolvedPlanKey = (payload: BillingPayload | null) =>
  normalizePlanKey(
    payload?.subscription?.plan?.type || payload?.subscription?.plan?.name || null
  );

const isActivated = (
  payload: BillingPayload | null,
  expectedPlan: string
) => {
  const billingStatus = payload?.billing?.status;
  const subscriptionStatus = payload?.subscription?.status;
  const active =
    billingStatus === "ACTIVE" ||
    billingStatus === "TRIAL" ||
    subscriptionStatus === "ACTIVE" ||
    subscriptionStatus === "TRIALING";

  if (!active) {
    return false;
  }

  if (!expectedPlan) {
    return true;
  }

  return getResolvedPlanKey(payload) === expectedPlan;
};

const getPlanLabel = (payload: BillingPayload | null) =>
  payload?.subscription?.plan?.name ||
  payload?.subscription?.plan?.type ||
  "your selected";

const getSuccessMessage = (payload: BillingPayload | null) => {
  const planLabel = getPlanLabel(payload);

  if (payload?.billing?.status === "TRIAL") {
    return `${planLabel} is now active and your trial is running.`;
  }

  return `${planLabel} is now active on your workspace.`;
};

const fetchBilling = async (signal?: AbortSignal): Promise<BillingPayload | null> => {
  try {
    const response = await apiFetch<BillingPayload>("/api/billing", {
      credentials: "include",
      cache: "no-store",
      signal,
    });

    if (!response.success || !response.data) {
      return null;
    }

    return response.data;
  } catch {
    return null;
  }
};

function SuccessPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const expectedPlan = normalizePlanKey(searchParams.get("plan"));
  const sessionId = searchParams.get("session_id");
  const checkoutMode = String(searchParams.get("mode") || "")
    .trim()
    .toLowerCase();
  const isInstantCheckout = checkoutMode === "instant";
  const [show, setShow] = useState(false);
  const [lifecycleState, setLifecycleState] =
    useState<CheckoutConfirmLifecycleState>("PENDING");
  const [polling, setPolling] = useState(true);
  const [message, setMessage] = useState("Verifying your payment...");
  const [resolvedPlan, setResolvedPlan] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    const abortController = new AbortController();
    const { signal } = abortController;
    let cancelled = false;

    const applyConfirmedState = (payload: BillingPayload | null, fallbackMessage?: string) => {
      if (cancelled) {
        return;
      }

      setLifecycleState("CONFIRMED");
      setPolling(false);
      if (payload) {
        setResolvedPlan(getPlanLabel(payload));
        setMessage(getSuccessMessage(payload));
        return;
      }
      setMessage(
        String(fallbackMessage || "").trim() || "Your subscription is now active."
      );
    };

    const applyProcessingState = (nextMessage?: string) => {
      if (cancelled) {
        return;
      }

      setLifecycleState("PROCESSING");
      setMessage(
        String(nextMessage || "").trim() ||
          "Payment received. Activating your subscription..."
      );
    };

    const applyTerminalFailureState = (nextMessage?: string) => {
      if (cancelled) {
        return;
      }

      setLifecycleState("FAILED_TERMINAL");
      setPolling(false);
      setMessage(
        String(nextMessage || "").trim() ||
          "Checkout confirmation failed. Please retry from billing."
      );
    };

    const activate = async () => {
      setPolling(true);
      setLifecycleState("PENDING");
      setMessage("Verifying your payment...");
      setResolvedPlan(null);

      window.setTimeout(() => {
        if (!cancelled && !signal.aborted) {
          setShow(true);
        }
      }, 250);

      if (!sessionId) {
        applyTerminalFailureState(
          "Checkout session is missing. Please return to billing and retry."
        );
        return;
      }

      let confirmResult = await confirmCheckout(sessionId, { signal });
      if (cancelled || signal.aborted) {
        return;
      }

      if (confirmResult.lifecycleState === "CONFIRMED") {
        if (isInstantCheckout) {
          applyConfirmedState(null, confirmResult.message);
          return;
        }

        const immediateBilling = await fetchBilling(signal);
        if (cancelled || signal.aborted) {
          return;
        }

        if (isActivated(immediateBilling, expectedPlan)) {
          applyConfirmedState(immediateBilling);
          return;
        }

        applyConfirmedState(null, confirmResult.message);
        return;
      }

      if (confirmResult.lifecycleState === "FAILED_TERMINAL" || confirmResult.terminal) {
        applyTerminalFailureState(confirmResult.message);
        return;
      }

      applyProcessingState(
        "Payment received. Activating your subscription..."
      );

      const deadlineAt = Date.now() + CHECKOUT_CONFIRM_POLL_WINDOW_MS;
      let attempt = 0;

      while (!cancelled && !signal.aborted && Date.now() < deadlineAt) {
        const billing = await fetchBilling(signal);
        if (cancelled || signal.aborted) {
          return;
        }

        if (isActivated(billing, expectedPlan)) {
          applyConfirmedState(billing);
          return;
        }

        confirmResult = await confirmCheckout(sessionId, { signal });
        if (cancelled || signal.aborted) {
          return;
        }

        if (confirmResult.lifecycleState === "CONFIRMED") {
          if (isInstantCheckout) {
            applyConfirmedState(null, confirmResult.message);
            return;
          }

          const confirmed = await fetchBilling(signal);
          if (cancelled || signal.aborted) {
            return;
          }

          if (isActivated(confirmed, expectedPlan)) {
            applyConfirmedState(confirmed);
            return;
          }

          applyConfirmedState(null, confirmResult.message);
          return;
        }

        if (confirmResult.lifecycleState === "FAILED_TERMINAL" || confirmResult.terminal) {
          applyTerminalFailureState(confirmResult.message);
          return;
        }

        applyProcessingState(
          confirmResult.message && !/failed|failure|error/i.test(confirmResult.message)
            ? confirmResult.message
            : "Payment received. Activating your subscription..."
        );

        attempt += 1;
        await sleepWithAbort(resolvePollingDelayMs(confirmResult, attempt), signal);
      }

      if (!cancelled && !signal.aborted) {
        setPolling(false);
        setLifecycleState("PROCESSING");
        setMessage(
          "Payment received. Activation is still in progress. You can keep this page open or check billing in a few moments."
        );
      }
    };

    void activate();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [expectedPlan, isInstantCheckout, retryTick, sessionId]);

  const statusTitle =
    lifecycleState === "PENDING"
      ? "Verifying Payment"
      : lifecycleState === "PROCESSING"
      ? polling
        ? "Activating Subscription"
        : "Activation In Progress"
      : lifecycleState === "CONFIRMED"
      ? "Subscription Active"
      : "Checkout Confirmation Failed";
  const statusTone =
    lifecycleState === "CONFIRMED"
      ? "border-green-500 text-green-600"
      : lifecycleState === "FAILED_TERMINAL"
      ? "border-red-400 text-red-600"
      : "border-blue-400 text-blue-600";
  const statusIcon =
    lifecycleState === "CONFIRMED"
      ? "OK"
      : lifecycleState === "FAILED_TERMINAL"
      ? "!"
      : "...";
  const canOpenBilling =
    lifecycleState === "CONFIRMED" ||
    lifecycleState === "FAILED_TERMINAL" ||
    (lifecycleState === "PROCESSING" && !polling);
  const primaryActionLabel = canOpenBilling
    ? lifecycleState === "PROCESSING"
      ? "Check Billing Status"
      : "Open Billing"
    : "Activating...";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <div className="mb-6 flex justify-center">
          <div
            className={`flex h-20 w-20 items-center justify-center rounded-full border-4 transition-all duration-500 ${statusTone} ${
              show ? "scale-100" : "scale-0"
            }`}
          >
            <span className="text-3xl">{statusIcon}</span>
          </div>
        </div>

        <h1 className="text-xl font-semibold text-gray-900">
          {statusTitle}
        </h1>

        <p className="mt-2 text-sm text-gray-500">{message}</p>

        {lifecycleState === "CONFIRMED" && resolvedPlan ? (
          <p className="mt-3 text-sm font-semibold text-gray-900">
            Active plan: {resolvedPlan}
          </p>
        ) : null}

        <button
          onClick={() => router.push("/billing")}
          disabled={!canOpenBilling}
          className="mt-6 w-full rounded-xl bg-blue-600 py-2.5 text-white disabled:opacity-50"
        >
          {primaryActionLabel}
        </button>

        {lifecycleState === "FAILED_TERMINAL" && sessionId ? (
          <button
            onClick={() => {
              setPolling(true);
              setLifecycleState("PENDING");
              setMessage("Retrying payment verification...");
              setRetryTick((value) => value + 1);
            }}
            className="mt-3 w-full rounded-xl border border-blue-200 py-2.5 text-blue-700"
          >
            Retry Verification
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SuccessPageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <h1 className="text-xl font-semibold text-gray-900">
          Verifying payment
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Preparing your billing confirmation...
        </p>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<SuccessPageFallback />}>
      <SuccessPageContent />
    </Suspense>
  );
}
