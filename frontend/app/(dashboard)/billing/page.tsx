"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldCheck, Sparkles } from "lucide-react";
import { redirectToCheckout } from "@/lib/billing";
import { notify } from "@/lib/toast";
import PaymentHistory from "@/components/billing/PaymentHistory";
import { apiFetch } from "@/lib/apiClient";
import { setDashboardRoutePrefetchPaused } from "@/lib/dashboardRoutePrefetch";
import LoadingButton from "@/components/ui/LoadingButton";
import { SkeletonCard } from "@/components/ui/feedback";
import { recordLifecycleEvent } from "@/lib/lifecycleTelemetry";

type Currency = "INR" | "USD";
type BillingCycle = "monthly" | "yearly";
type PlanId = "BASIC" | "PRO" | "ELITE";

type Subscription = {
  stripeSubscriptionId?: string | null;
  currency?: Currency | null;
  billingCycle?: BillingCycle | null;
  trialUsed?: boolean;
  currentPeriodEnd?: string | null;
  plan?: {
    name?: string | null;
    type?: string | null;
  } | null;
};

type Invoice = {
  id: string;
  amount?: number;
  subtotal?: number;
  taxAmount?: number;
  currency?: string;
  created?: number;
  status?: string;
  hosted_invoice_url?: string;
  invoice_pdf?: string;
};

type BillingContext = {
  planKey?: string;
  status?: "INACTIVE" | "ACTIVE" | "TRIAL";
  allowEarly?: boolean;
  remainingEarly?: number;
};

type PricingPlan = {
  id: string;
  name: string;
  type: PlanId;
  description: string;
  popular?: boolean;
  monthlyPrice: Record<Currency, number>;
  yearlyPrice: Record<Currency, number>;
  limits: {
    contactsLimit: number;
    aiDailyLimit: number;
    aiMonthlyLimit: number;
    messageLimit: number;
    automationLimit: number;
  };
  features: string[];
};

type PlansResponse = {
  plans: PricingPlan[];
  addons?: Array<{
    type: string;
    label: string;
    description: string;
  }>;
  trialDays?: number;
  meta?: {
    degraded?: boolean;
    reason?: string | null;
  } | null;
};

type BillingApiResponse = {
  subscription?: Subscription | null;
  invoices?: Invoice[];
  billing?: BillingContext | null;
  currency?: Currency;
  meta?: {
    degraded?: boolean;
    reason?: string | null;
  } | null;
};

const DEFAULT_BILLING_CONTEXT: BillingContext = {
  planKey: "FREE_LOCKED",
  status: "INACTIVE",
  allowEarly: false,
  remainingEarly: 0,
};

const BILLING_SNAPSHOT_ENDPOINT = "/api/billing?surface=checkout";
const BILLING_API_TIMEOUT_MS = 7_000;
const BILLING_BOOTSTRAP_CACHE_TTL_MS = 30_000;
const BILLING_BACKGROUND_REFRESH_BASE_MS = 90_000;
const BILLING_BACKGROUND_REFRESH_HIDDEN_MS = 180_000;
const BILLING_BACKGROUND_REFRESH_MAX_MS = 420_000;
const BILLING_REQUEST_COOLDOWN_MS = 1_200;
const BILLING_FAILURE_COOLDOWN_MS = 8_000;

type BillingTelemetryName =
  | "billing_page_initial_requests"
  | "duplicate_fetch_blocked"
  | "checkout_background_refresh_paused";

const recordBillingTelemetry = (
  name: BillingTelemetryName,
  metadata?: Record<string, unknown>
) => {
  if (typeof window === "undefined") {
    return;
  }

  console.info(name, {
    recordedAt: new Date().toISOString(),
    metadata: metadata || {},
  });
};

type BillingBootstrapSnapshot = {
  billingData: BillingApiResponse | null;
  plansData: PlansResponse | null;
  updatedAt: number;
};

let billingBootstrapSnapshot: BillingBootstrapSnapshot | null = null;
let billingBootstrapInFlight: Promise<BillingBootstrapSnapshot> | null = null;
let billingRequestInFlight: Promise<BillingApiResponse | null> | null = null;
let plansRequestInFlight: Promise<PlansResponse | null> | null = null;
let lastBillingRequestAt = 0;
let lastPlansRequestAt = 0;
let billingFailureCooldownUntil = 0;
let plansFailureCooldownUntil = 0;

const FALLBACK_PLANS_RESPONSE: PlansResponse = {
  trialDays: 7,
  addons: [
    {
      type: "ai_credits",
      label: "Buy Extra AI Calls",
      description: "Daily limit reached? Extra AI calls are consumed immediately.",
    },
    {
      type: "contacts",
      label: "Contacts add-on",
      description: "Expand lead capacity without changing your core plan.",
    },
  ],
  plans: [
    {
      id: "BASIC",
      name: "Starter",
      type: "BASIC",
      description: "Daily AI coverage for new teams getting their first wins.",
      monthlyPrice: { INR: 999, USD: 15 },
      yearlyPrice: { INR: 9990, USD: 150 },
      limits: {
        contactsLimit: 1000,
        aiDailyLimit: 150,
        aiMonthlyLimit: 4500,
        messageLimit: 5000,
        automationLimit: 300,
      },
      features: [
        "1,000 active contacts included",
        "150 AI calls every day",
        "5,000 messages each month",
        "300 automation runs each month",
        "Buy extra AI calls anytime",
      ],
    },
    {
      id: "PRO",
      name: "Growth",
      type: "PRO",
      description: "Higher daily AI headroom for teams scaling conversations.",
      popular: true,
      monthlyPrice: { INR: 2999, USD: 39 },
      yearlyPrice: { INR: 29990, USD: 390 },
      limits: {
        contactsLimit: 5000,
        aiDailyLimit: 300,
        aiMonthlyLimit: 9000,
        messageLimit: 20000,
        automationLimit: 3000,
      },
      features: [
        "5,000 active contacts included",
        "300 AI calls every day",
        "20,000 messages each month",
        "3,000 automation runs each month",
        "Buy extra AI calls anytime",
      ],
    },
    {
      id: "ELITE",
      name: "Elite",
      type: "ELITE",
      description: "Generous daily AI throughput with controlled high-volume automation.",
      monthlyPrice: { INR: 7999, USD: 99 },
      yearlyPrice: { INR: 79990, USD: 990 },
      limits: {
        contactsLimit: 20000,
        aiDailyLimit: 800,
        aiMonthlyLimit: 24000,
        messageLimit: -1,
        automationLimit: 10000,
      },
      features: [
        "20,000 active contacts included",
        "800 AI calls every day",
        "Unlimited monthly messages",
        "10,000 automation runs each month",
        "Priority support",
      ],
    },
  ],
};

const readCachedBillingBootstrapSnapshot = () => {
  if (!billingBootstrapSnapshot) {
    return null;
  }

  if (Date.now() - billingBootstrapSnapshot.updatedAt > BILLING_BOOTSTRAP_CACHE_TTL_MS) {
    return null;
  }

  return billingBootstrapSnapshot;
};

const fetchBillingSummary = async (options?: { background?: boolean }) => {
  const isBackground = Boolean(options?.background);
  const now = Date.now();

  if (billingRequestInFlight) {
    recordBillingTelemetry("duplicate_fetch_blocked", {
      endpoint: BILLING_SNAPSHOT_ENDPOINT,
      reason: "inflight",
      background: isBackground,
    });
    return billingRequestInFlight;
  }

  if (isBackground && now < billingFailureCooldownUntil) {
    recordBillingTelemetry("duplicate_fetch_blocked", {
      endpoint: BILLING_SNAPSHOT_ENDPOINT,
      reason: "failure_cooldown",
      background: true,
      waitMs: billingFailureCooldownUntil - now,
    });
    return null;
  }

  if (isBackground && now - lastBillingRequestAt < BILLING_REQUEST_COOLDOWN_MS) {
    recordBillingTelemetry("duplicate_fetch_blocked", {
      endpoint: BILLING_SNAPSHOT_ENDPOINT,
      reason: "request_cooldown",
      background: true,
      waitMs: BILLING_REQUEST_COOLDOWN_MS - (now - lastBillingRequestAt),
    });
    return null;
  }

  lastBillingRequestAt = now;
  billingRequestInFlight = fetchJsonWithRetry<BillingApiResponse>(
    BILLING_SNAPSHOT_ENDPOINT,
    isBackground ? 0 : 1,
    BILLING_API_TIMEOUT_MS
  )
    .then((data) => {
      billingFailureCooldownUntil = 0;
      return data;
    })
    .catch((error) => {
      billingFailureCooldownUntil = Date.now() + BILLING_FAILURE_COOLDOWN_MS;
      throw error;
    })
    .finally(() => {
      billingRequestInFlight = null;
    });

  return billingRequestInFlight;
};

const fetchPlansCatalog = async (options?: { background?: boolean }) => {
  const isBackground = Boolean(options?.background);
  const now = Date.now();

  if (plansRequestInFlight) {
    recordBillingTelemetry("duplicate_fetch_blocked", {
      endpoint: "/api/billing/plans",
      reason: "inflight",
      background: isBackground,
    });
    return plansRequestInFlight;
  }

  if (isBackground && now < plansFailureCooldownUntil) {
    recordBillingTelemetry("duplicate_fetch_blocked", {
      endpoint: "/api/billing/plans",
      reason: "failure_cooldown",
      background: true,
      waitMs: plansFailureCooldownUntil - now,
    });
    return null;
  }

  if (isBackground && now - lastPlansRequestAt < BILLING_REQUEST_COOLDOWN_MS) {
    recordBillingTelemetry("duplicate_fetch_blocked", {
      endpoint: "/api/billing/plans",
      reason: "request_cooldown",
      background: true,
      waitMs: BILLING_REQUEST_COOLDOWN_MS - (now - lastPlansRequestAt),
    });
    return null;
  }

  lastPlansRequestAt = now;
  plansRequestInFlight = fetchJsonWithRetry<PlansResponse>(
    "/api/billing/plans",
    isBackground ? 0 : 1,
    BILLING_API_TIMEOUT_MS
  )
    .then((data) => {
      plansFailureCooldownUntil = 0;
      return data;
    })
    .catch((error) => {
      plansFailureCooldownUntil = Date.now() + BILLING_FAILURE_COOLDOWN_MS;
      throw error;
    })
    .finally(() => {
      plansRequestInFlight = null;
    });

  return plansRequestInFlight;
};

const refreshBillingBootstrapSnapshot = async (options?: { background?: boolean }) => {
  const isBackground = Boolean(options?.background);
  if (billingBootstrapInFlight) {
    recordBillingTelemetry("duplicate_fetch_blocked", {
      endpoint: "billing_bootstrap_snapshot",
      reason: "snapshot_inflight",
      background: isBackground,
    });
    return billingBootstrapInFlight;
  }

  billingBootstrapInFlight = (async () => {
    const [billingResult, plansResult] = await Promise.allSettled([
      fetchBillingSummary(options),
      fetchPlansCatalog(options),
    ]);

    const nextSnapshot: BillingBootstrapSnapshot = {
      billingData:
        billingResult.status === "fulfilled" ? (billingResult.value || null) : null,
      plansData:
        plansResult.status === "fulfilled" ? (plansResult.value || null) : null,
      updatedAt: Date.now(),
    };

    if (nextSnapshot.billingData || nextSnapshot.plansData) {
      billingBootstrapSnapshot = nextSnapshot;
    }

    return nextSnapshot;
  })().finally(() => {
    billingBootstrapInFlight = null;
  });

  return billingBootstrapInFlight;
};

const fetchJsonWithRetry = async <T,>(
  url: string,
  retries = 1,
  timeoutMs = BILLING_API_TIMEOUT_MS
) => {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= retries) {
    try {
      return await fetchJson<T>(url, timeoutMs);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Request failed");
      attempt += 1;

      if (attempt > retries) {
        break;
      }

      await new Promise((resolve) =>
        window.setTimeout(resolve, 350 * attempt)
      );
    }
  }

  throw lastError || new Error("Request failed");
};

const formatMoney = (amount: number, currency: Currency) =>
  new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);

const normalizePlanKey = (value?: string | null) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

const getCheckoutFailureMessage = (reason: string | null) => {
  switch (reason) {
    case "checkout_in_progress":
      return "Another checkout attempt is already in progress. Please wait a moment and retry.";
    case "checkout_url_missing":
      return "Stripe checkout link is not ready yet. Please retry in a few seconds.";
    case "provider_timeout":
      return "Stripe took longer than expected. Please try again in a few seconds.";
    case "provider_unavailable":
      return "Stripe is temporarily unavailable. Please retry shortly.";
    case "request_queue_timeout":
    case "request_timeout":
      return "Checkout timed out before redirect. Please retry now.";
    case "unauthorized":
    case "session_expired":
      return "Your auth session expired. Please sign in again and retry checkout.";
    case "business_context_required":
    case "billing_unavailable":
      return "Billing is temporarily unavailable. Please retry in a moment.";
    case "manual_review_required":
      return "Checkout is paused for risk review. Contact support if this persists.";
    case "invalid_plan":
    case "invalid_billing":
    case "checkout_invalid":
      return "Checkout settings are temporarily misconfigured. Please try again, or contact support if this repeats.";
    default:
      return "We couldn't start checkout right now. Please try again.";
  }
};

const isCurrentPlan = (
  subscription: Subscription | null,
  planId: PlanId,
  planKey: string
) => {
  if (planKey === "FREE_LOCKED" || planKey === "LOCKED") {
    return false;
  }

  const currentType = normalizePlanKey(subscription?.plan?.type);
  const currentName = normalizePlanKey(subscription?.plan?.name);

  return currentType === planId || currentName === planId;
};

async function fetchJson<T>(url: string, timeoutMs = BILLING_API_TIMEOUT_MS) {
  const response = await apiFetch<T>(url, {
    credentials: "include",
    cache: "no-store",
    timeoutMs,
  });

  if (!response.success || !response.data) {
    throw new Error(response.message || "Request failed");
  }

  return response.data as T;
}

function BillingPageContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"plans" | "history">("plans");
  const [loading, setLoading] = useState<PlanId | null>(null);
  const [checkoutProgressMessage, setCheckoutProgressMessage] = useState<string | null>(null);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const [currency, setCurrency] = useState<Currency>("INR");
  const [lockedCurrency, setLockedCurrency] = useState<Currency | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [billingContext, setBillingContext] = useState<BillingContext | null>(null);
  const [plansResponse, setPlansResponse] = useState<PlansResponse>(FALLBACK_PLANS_RESPONSE);
  const [pageLoading, setPageLoading] = useState(true);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [plansRequestFailed, setPlansRequestFailed] = useState(false);
  const hasLoadedBillingRef = useRef(false);
  const hasLoadedPlansRef = useRef(false);
  const checkoutLockRef = useRef(false);
  const loadBillingInFlightRef = useRef<Promise<boolean> | null>(null);
  const initialTelemetryRecordedRef = useRef(false);
  const checkoutPauseTelemetryLastAtRef = useRef(0);
  const backgroundFailureCountRef = useRef(0);
  const backgroundRefreshTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setDashboardRoutePrefetchPaused(true);
    return () => {
      setDashboardRoutePrefetchPaused(false);
    };
  }, []);

  const applyBillingState = useCallback((billingData: BillingApiResponse) => {
    setSubscription(billingData.subscription || null);
    setInvoices(Array.isArray(billingData.invoices) ? billingData.invoices : []);
    setBillingContext(billingData.billing || DEFAULT_BILLING_CONTEXT);

    const nextCurrency =
      billingData.subscription?.currency || billingData.currency || "INR";

    setCurrency(nextCurrency);
    setLockedCurrency(billingData.subscription?.currency || null);

    if (
      billingData.subscription?.billingCycle === "monthly" ||
      billingData.subscription?.billingCycle === "yearly"
    ) {
      setBilling(billingData.subscription.billingCycle);
    }
  }, []);

  const applyPlansState = useCallback((plansData: PlansResponse) => {
    const normalizedPlans = Array.isArray(plansData.plans)
      ? plansData.plans
      : [];
    const normalizedAddons = Array.isArray(plansData.addons)
      ? plansData.addons
      : [];

    setPlansResponse((current) => ({
      plans:
        normalizedPlans.length > 0
          ? normalizedPlans
          : current.plans.length > 0
            ? current.plans
            : FALLBACK_PLANS_RESPONSE.plans,
      addons:
        normalizedAddons.length > 0
          ? normalizedAddons
          : current.addons && current.addons.length > 0
            ? current.addons
            : FALLBACK_PLANS_RESPONSE.addons,
      trialDays: plansData.trialDays || current.trialDays || 7,
      meta: plansData.meta ?? current.meta ?? null,
    }));
  }, []);

  const loadBilling = useCallback(async (options?: { background?: boolean }) => {
    const isBackground = Boolean(options?.background);
    const checkoutSafePaused =
      checkoutLockRef.current || Boolean(loading) || checkoutPending;
    if (isBackground && checkoutSafePaused) {
      const now = Date.now();
      if (now - checkoutPauseTelemetryLastAtRef.current > 3_000) {
        checkoutPauseTelemetryLastAtRef.current = now;
        recordBillingTelemetry("checkout_background_refresh_paused", {
          loadingPlan: loading,
          checkoutPending,
        });
      }
      return;
    }

    if (loadBillingInFlightRef.current) {
      recordBillingTelemetry("duplicate_fetch_blocked", {
        endpoint: "billing_load",
        reason: "load_inflight",
        background: isBackground,
      });
      await loadBillingInFlightRef.current;
      return;
    }

    const run = async () => {
      let successfulRefresh = false;

      try {
        if (!initialTelemetryRecordedRef.current) {
          initialTelemetryRecordedRef.current = true;
          recordBillingTelemetry("billing_page_initial_requests", {
            requestCount: 2,
            endpoints: [BILLING_SNAPSHOT_ENDPOINT, "/api/billing/plans"],
          });
        }

        const hasAnyData = hasLoadedBillingRef.current || hasLoadedPlansRef.current;
        if (!isBackground && !hasAnyData) {
          setPageLoading(true);
          setLoadWarning(null);
        } else {
          setBackgroundRefreshing(true);
        }

        const cachedSnapshot = readCachedBillingBootstrapSnapshot();
        if (cachedSnapshot?.billingData && !hasLoadedBillingRef.current) {
          applyBillingState(cachedSnapshot.billingData);
          hasLoadedBillingRef.current = true;
          if (!isBackground) {
            setPageLoading(false);
          }
        }
        if (cachedSnapshot?.plansData && !hasLoadedPlansRef.current) {
          applyPlansState(cachedSnapshot.plansData);
          hasLoadedPlansRef.current = true;
          setPlansRequestFailed(false);
          if (!isBackground) {
            setPageLoading(false);
          }
        }

        const snapshot = await refreshBillingBootstrapSnapshot({
          background: isBackground || hasAnyData,
        });
        const warnings: string[] = [];

        if (snapshot.billingData) {
          applyBillingState(snapshot.billingData);
          hasLoadedBillingRef.current = true;
          if (snapshot.billingData.meta?.degraded) {
            warnings.push(
              "Live billing sync is delayed. Showing the latest safe snapshot."
            );
          }
        } else if (!hasLoadedBillingRef.current) {
          warnings.push("Billing summary is delayed. Showing safe fallback data.");
        }

        if (snapshot.plansData) {
          applyPlansState(snapshot.plansData);
          hasLoadedPlansRef.current = true;
          setPlansRequestFailed(false);
          if (snapshot.plansData.meta?.degraded) {
            warnings.push("Plan catalog is in recovery mode. Prices remain available.");
          }
        } else if (!hasLoadedPlansRef.current) {
          setPlansRequestFailed(true);
          warnings.push("Plan catalog refresh is delayed. Showing safe pricing cards.");
        }

        if (
          !snapshot.billingData &&
          !snapshot.plansData &&
          !hasLoadedBillingRef.current &&
          !hasLoadedPlansRef.current
        ) {
          warnings.length = 0;
          warnings.push("Billing data is warming up. Please retry in a few seconds.");
        }

        setLoadWarning(warnings.length ? warnings.join(" ") : null);
        successfulRefresh = Boolean(snapshot.billingData || snapshot.plansData);
      } catch (loadError) {
        if (!hasLoadedPlansRef.current) {
          setPlansRequestFailed(true);
        }
        setLoadWarning(
          loadError instanceof Error
            ? loadError.message
            : "Some billing data could not be loaded."
        );
        successfulRefresh = false;
      } finally {
        setPageLoading(false);
        setBackgroundRefreshing(false);
      }

      return successfulRefresh;
    };

    const pending = run().finally(() => {
      loadBillingInFlightRef.current = null;
    });
    loadBillingInFlightRef.current = pending;
    return pending;
  }, [
    applyBillingState,
    applyPlansState,
    checkoutPending,
    loading,
  ]);

  useEffect(() => {
    let cancelled = false;

    const clearScheduledRefresh = () => {
      if (backgroundRefreshTimeoutRef.current === null) {
        return;
      }

      window.clearTimeout(backgroundRefreshTimeoutRef.current);
      backgroundRefreshTimeoutRef.current = null;
    };

    const getNextRefreshDelayMs = () => {
      const failureCount = backgroundFailureCountRef.current;
      if (failureCount > 0) {
        const backoffDelayMs = Math.min(
          BILLING_BACKGROUND_REFRESH_MAX_MS,
          BILLING_BACKGROUND_REFRESH_BASE_MS *
            2 ** Math.min(failureCount - 1, 3) +
            Math.floor(Math.random() * 450)
        );

        recordLifecycleEvent("polling_backoff_applied", {
          area: "billing_background_refresh",
          failureCount,
          delayMs: backoffDelayMs,
        });

        return backoffDelayMs;
      }

      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return BILLING_BACKGROUND_REFRESH_HIDDEN_MS;
      }

      return BILLING_BACKGROUND_REFRESH_BASE_MS;
    };

    const scheduleNextRefresh = (delayMs: number) => {
      clearScheduledRefresh();

      if (cancelled) {
        return;
      }

      backgroundRefreshTimeoutRef.current = window.setTimeout(async () => {
        if (cancelled) {
          return;
        }

        if (checkoutLockRef.current || loading || checkoutPending) {
          const now = Date.now();
          if (now - checkoutPauseTelemetryLastAtRef.current > 3_000) {
            checkoutPauseTelemetryLastAtRef.current = now;
            recordBillingTelemetry("checkout_background_refresh_paused", {
              loadingPlan: loading,
              checkoutPending,
            });
          }

          scheduleNextRefresh(getNextRefreshDelayMs());
          return;
        }

        // Restrict background fetch loops on mount unless the "history" tab is selected or initial load is completing.
        const initialLoadCompleted = hasLoadedBillingRef.current && hasLoadedPlansRef.current;
        if (activeTab !== "history" && initialLoadCompleted) {
          scheduleNextRefresh(getNextRefreshDelayMs());
          return;
        }

        const successfulRefresh = await loadBilling({
          background: true,
        });

        backgroundFailureCountRef.current = successfulRefresh
          ? 0
          : backgroundFailureCountRef.current + 1;

        scheduleNextRefresh(getNextRefreshDelayMs());
      }, Math.max(1_000, Math.floor(delayMs)));
    };

    void loadBilling().then((successful) => {
      backgroundFailureCountRef.current = successful ? 0 : 1;
      scheduleNextRefresh(getNextRefreshDelayMs());
    });

    return () => {
      cancelled = true;
      clearScheduledRefresh();
    };
      <SkeletonCard className="h-28" />
      <SkeletonCard className="h-36" />
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <SkeletonCard key={index} className="h-[32rem]" />
        ))}
      </div>
      <SkeletonCard className="h-72" />
    </div>
  );
}

function BillingPageFallback() {
  return <BillingPageSkeleton />;
}

export default function BillingPage() {
  return (
    <Suspense fallback={<BillingPageFallback />}>
      <BillingPageContent />
    </Suspense>
  );
}
