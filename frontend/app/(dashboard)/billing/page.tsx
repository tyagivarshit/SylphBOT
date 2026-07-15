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
  status?: string | null;
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

const BILLING_SNAPSHOT_ENDPOINT = "/api/billing?surface=billing";
const BILLING_API_TIMEOUT_MS = 7_000;
const BILLING_BOOTSTRAP_CACHE_TTL_MS = 30_000;
const BILLING_BACKGROUND_REFRESH_BASE_MS = 90_000;
const BILLING_BACKGROUND_REFRESH_HIDDEN_MS = 180_000;
const BILLING_BACKGROUND_REFRESH_MAX_MS = 420_000;
const BILLING_REQUEST_COOLDOWN_MS = 1_200;
const BILLING_FAILURE_COOLDOWN_MS = 8_000;
const CHECKOUT_NAVIGATION_RECOVERY_MS = 15_000;

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
let billingAbortController: AbortController | null = null;

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

const isPaidSnapshot = (snapshot: BillingBootstrapSnapshot | null) => {
  const plan = snapshot?.billingData?.billing?.planKey;
  return plan && plan !== "FREE_LOCKED" && plan !== "LOCKED";
};

const readCachedBillingBootstrapSnapshot = () => {
  if (!billingBootstrapSnapshot) {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("lkv-billing-bootstrap-snapshot");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed) {
            billingBootstrapSnapshot = parsed;
          }
        }
      } catch {}
    }
  }

  if (!billingBootstrapSnapshot) {
    return null;
  }

  const isPaid = isPaidSnapshot(billingBootstrapSnapshot);
  if (!isPaid && Date.now() - billingBootstrapSnapshot.updatedAt > BILLING_BOOTSTRAP_CACHE_TTL_MS) {
    return null;
  }

  return billingBootstrapSnapshot;
};

const fetchBillingSummary = async (options?: { background?: boolean; signal?: AbortSignal }) => {
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
    BILLING_API_TIMEOUT_MS,
    options?.signal
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

const fetchPlansCatalog = async (options?: { background?: boolean; signal?: AbortSignal }) => {
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
    BILLING_API_TIMEOUT_MS,
    options?.signal
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

const refreshBillingBootstrapSnapshot = async (options?: { background?: boolean; signal?: AbortSignal }) => {
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

    const prevSnapshot = billingBootstrapSnapshot;
    const nextSnapshot: BillingBootstrapSnapshot = {
      billingData:
        billingResult.status === "fulfilled" && billingResult.value
          ? billingResult.value
          : (prevSnapshot?.billingData || null),
      plansData:
        plansResult.status === "fulfilled" && plansResult.value
          ? plansResult.value
          : (prevSnapshot?.plansData || null),
      updatedAt: Date.now(),
    };

    if (nextSnapshot.billingData || nextSnapshot.plansData) {
      billingBootstrapSnapshot = nextSnapshot;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("lkv-billing-bootstrap-snapshot", JSON.stringify(nextSnapshot));
        } catch {}
      }
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
  timeoutMs = BILLING_API_TIMEOUT_MS,
  signal?: AbortSignal
) => {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= retries) {
    try {
      return await fetchJson<T>(url, timeoutMs, signal);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
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

async function fetchJson<T>(url: string, timeoutMs = BILLING_API_TIMEOUT_MS, signal?: AbortSignal) {
  const response = await apiFetch<T>(url, {
    credentials: "include",
    cache: "no-store",
    timeoutMs,
    signal,
  });

  if (!response.success || !response.data) {
    throw new Error(response.message || "Request failed");
  }

  return response.data as T;
}

function BillingPageContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"plans" | "history">("plans");
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [hasLoadedInvoices, setHasLoadedInvoices] = useState(false);
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
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [plansRequestFailed, setPlansRequestFailed] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const handleManageBilling = useCallback(async () => {
    setPortalLoading(true);
    try {
      const response = await apiFetch<{ url?: string }>("/api/billing/portal", {
        method: "POST",
        credentials: "include",
      });

      if (!response.success || !response.data?.url) {
        throw new Error(response.message || "Billing portal is temporarily unavailable");
      }

      window.location.assign(response.data.url);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  }, []);
  const hasLoadedBillingRef = useRef(false);
  const hasLoadedPlansRef = useRef(false);
  const checkoutLockRef = useRef(false);
  const loadBillingInFlightRef = useRef<Promise<boolean> | null>(null);
  const initialTelemetryRecordedRef = useRef(false);
  const checkoutPauseTelemetryLastAtRef = useRef(0);
  const backgroundFailureCountRef = useRef(0);
  const backgroundRefreshTimeoutRef = useRef<number | null>(null);

  const loadInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      const data = await fetchJson<BillingApiResponse>("/api/billing?surface=history");
      setInvoices(Array.isArray(data.invoices) ? data.invoices : []);
      setHasLoadedInvoices(true);
    } catch (err) {
      notify.error("Could not load payment history. Please retry.");
    } finally {
      setInvoicesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "history" && !hasLoadedInvoices && !invoicesLoading) {
      void loadInvoices();
    }
  }, [activeTab, hasLoadedInvoices, invoicesLoading, loadInvoices]);

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
    if (checkoutSafePaused) {
      const now = Date.now();
      if (now - checkoutPauseTelemetryLastAtRef.current > 3_000) {
        checkoutPauseTelemetryLastAtRef.current = now;
        recordBillingTelemetry("checkout_background_refresh_paused", {
          loadingPlan: loading,
          checkoutPending,
          background: isBackground,
        });
      }
      return false;
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

      if (billingAbortController) {
        billingAbortController.abort();
      }
      billingAbortController = new AbortController();
      const signal = billingAbortController.signal;

      try {
        if (!initialTelemetryRecordedRef.current) {
          initialTelemetryRecordedRef.current = true;
          recordBillingTelemetry("billing_page_initial_requests", {
            requestCount: 2,
            endpoints: [BILLING_SNAPSHOT_ENDPOINT, "/api/billing/plans"],
          });
        }

        if (!isBackground) {
          setLoadWarning(null);
        } else {
          setBackgroundRefreshing(true);
        }

        const cachedSnapshot = readCachedBillingBootstrapSnapshot();
        if (cachedSnapshot?.billingData && !hasLoadedBillingRef.current) {
          applyBillingState(cachedSnapshot.billingData);
          hasLoadedBillingRef.current = true;
        }
        if (cachedSnapshot?.plansData && !hasLoadedPlansRef.current) {
          applyPlansState(cachedSnapshot.plansData);
          hasLoadedPlansRef.current = true;
          setPlansRequestFailed(false);
        }

        const snapshot = await refreshBillingBootstrapSnapshot({
          background: isBackground,
          signal,
        });

        if (signal.aborted) {
          return false;
        }

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
        if (signal.aborted) {
          return false;
        }
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
        if (isBackground) {
          setBackgroundRefreshing(false);
        }
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

        const successfulRefresh = await loadBilling({
          background: true,
        });

        backgroundFailureCountRef.current = successfulRefresh
          ? 0
          : backgroundFailureCountRef.current + 1;

        scheduleNextRefresh(getNextRefreshDelayMs());
      }, Math.max(1_000, Math.floor(delayMs)));
    };

    if (checkoutLockRef.current || loading || checkoutPending) {
      scheduleNextRefresh(getNextRefreshDelayMs());
    } else {
      void loadBilling().then((successful) => {
        backgroundFailureCountRef.current = successful ? 0 : 1;
        scheduleNextRefresh(getNextRefreshDelayMs());
      });
    }

    return () => {
      cancelled = true;
      clearScheduledRefresh();
    };
  }, [checkoutPending, loadBilling, loading]);

  const planKey = billingContext?.planKey || "FREE_LOCKED";
  const isEntitlementKnown = billingContext !== null;
  const billingStatus = billingContext?.status || "INACTIVE";
  const allowEarly = Boolean(billingContext?.allowEarly);
  const remainingEarly = billingContext?.remainingEarly || 0;
  const hasUsedTrial = Boolean(subscription?.trialUsed);
  const isCancelled = searchParams.get("checkout") === "cancelled";
  const isCheckoutFailed = searchParams.get("checkout") === "failed";
  const checkoutFailureReason = searchParams.get("reason");
  const checkoutFailureMessage = getCheckoutFailureMessage(checkoutFailureReason);
  const currentPeriodEnd = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
    : null;

  const plans = useMemo(
    () =>
      plansResponse.plans.slice().sort((left, right) => {
        const order: PlanId[] = ["BASIC", "PRO", "ELITE"];
        return order.indexOf(left.type) - order.indexOf(right.type);
      }),
    [plansResponse.plans]
  );

  const handleCheckout = (plan: PlanId) => {
    if (checkoutLockRef.current) {
      return;
    }

    try {
      setLoading(plan);
      setCheckoutPending(true);
      setCheckoutProgressMessage("Preparing secure Stripe checkout...");

      const latestBilling = billingBootstrapSnapshot?.billingData;
      if (latestBilling) {
        const latestPlanKey = latestBilling.billing?.planKey || "FREE_LOCKED";
        const latestSubscription = latestBilling.subscription || null;
        const isCurrent = isCurrentPlan(latestSubscription, plan, latestPlanKey);

        if (isCurrent) {
          throw new Error(
            `You are already subscribed to the ${plan.charAt(0) + plan.slice(1).toLowerCase()} plan.`
          );
        }

        const latestLockedCurrency = latestSubscription?.currency || null;
        const latestCurrency = latestSubscription?.currency || latestBilling.currency || "INR";

        if (latestLockedCurrency && latestLockedCurrency !== latestCurrency) {
          throw new Error(
            "Your billing currency is already locked for this workspace."
          );
        }
      }

      if (billingAbortController) {
        billingAbortController.abort();
        billingAbortController = null;
      }
      checkoutLockRef.current = true;
      redirectToCheckout(plan, billing);
      window.setTimeout(() => {
        if (checkoutLockRef.current) {
          checkoutLockRef.current = false;
          setLoading(null);
          setCheckoutPending(false);
          setCheckoutProgressMessage(null);
        }
      }, CHECKOUT_NAVIGATION_RECOVERY_MS);
    } catch (checkoutError) {
      checkoutLockRef.current = false;
      setLoading(null);
      setCheckoutPending(false);
      setCheckoutProgressMessage(null);
      notify.error(
        checkoutError instanceof Error
          ? checkoutError.message
          : "We couldn't start checkout right now."
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="brand-info-strip rounded-[26px] p-4 sm:p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Pricing and billing
            </p>
          </div>

          <div className="flex rounded-2xl border border-slate-200/80 bg-white/90 p-1 shadow-sm">
            {(["monthly", "yearly"] as BillingCycle[]).map((type) => (
              <button
                key={type}
                onClick={() => setBilling(type)}
                className={`rounded-[14px] px-5 py-2 text-sm font-semibold transition-all ${
                  billing === type
                    ? "bg-[linear-gradient(135deg,#081223_0%,#0b2a5b_55%,#1e5eff_100%)] text-white shadow"
                    : "text-slate-600"
                }`}
              >
                {type === "monthly" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* TAB NAVIGATION */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200/80 bg-slate-50/70 p-2.5 rounded-[22px]">
        <button
          type="button"
          onClick={() => setActiveTab("plans")}
          className={`rounded-xl px-5 py-2.5 text-xs sm:text-sm font-semibold transition-all duration-200 ${
            activeTab === "plans"
              ? "bg-white text-blue-600 shadow-sm border border-slate-200/60"
              : "text-slate-600 hover:bg-white/80 hover:text-slate-900"
          }`}
        >
          Plans & Pricing
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`rounded-xl px-5 py-2.5 text-xs sm:text-sm font-semibold transition-all duration-200 ${
            activeTab === "history"
              ? "bg-white text-blue-600 shadow-sm border border-slate-200/60"
              : "text-slate-600 hover:bg-white/80 hover:text-slate-900"
          }`}
        >
          Payment History
        </button>
      </div>

      {activeTab === "plans" ? (
        <>
          {loadWarning ? (
            planKey === "FREE_LOCKED" || planKey === "LOCKED" ? (
              <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span>{loadWarning}</span>
                  <button
                    onClick={() => {
                      void loadBilling();
                    }}
                    className="inline-flex w-fit items-center rounded-lg border border-amber-300 bg-white/80 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-white"
                  >
                    Retry now
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600 flex items-center justify-between gap-3 max-w-xl">
                <span>{loadWarning}</span>
                <button
                  onClick={() => {
                    void loadBilling();
                  }}
                  className="underline text-slate-800 hover:text-slate-950 font-semibold transition"
                >
                  Retry
                </button>
              </div>
            )
          ) : null}



          {checkoutProgressMessage ? (
            <div className="rounded-[24px] border border-blue-200 bg-blue-50/90 px-5 py-4 text-sm text-blue-700 shadow-sm">
              {checkoutProgressMessage}
            </div>
          ) : null}

          {isCancelled ? (
            <div className="rounded-[24px] border border-amber-200 bg-amber-50/90 px-5 py-4 text-sm text-amber-800 shadow-sm">
              Checkout was cancelled. Your current plan has not changed.
            </div>
          ) : null}

          {isCheckoutFailed ? (
            <div className="rounded-[24px] border border-rose-200 bg-rose-50/90 px-5 py-4 text-sm text-rose-700 shadow-sm">
              {checkoutFailureMessage}
            </div>
          ) : null}

          {allowEarly ? (
            <div className="brand-info-strip rounded-[24px] px-5 py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Early access offer is still live
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    {remainingEarly} discounted spot{remainingEarly === 1 ? "" : "s"} remaining.
                  </p>
                </div>
                <span className="brand-chip">
                  <Sparkles size={13} />
                  Early pricing
                </span>
              </div>
            </div>
          ) : null}

          <div className="brand-section-shell rounded-[26px] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {!isEntitlementKnown ? (
                <div className="space-y-2 w-full max-w-lg">
                  <div className="h-4 bg-slate-200/80 rounded animate-pulse w-2/3" />
                  <div className="h-3 bg-slate-200/80 rounded animate-pulse w-[90%]" />
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {billingStatus === "TRIAL"
                      ? `${plansResponse.trialDays} day trial is active`
                      : billingStatus === "ACTIVE"
                        ? "Paid subscription is active"
                        : hasUsedTrial
                          ? "Trial already used"
                          : `Your first checkout includes a ${plansResponse.trialDays} day free trial`}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    {billingStatus === "TRIAL" && currentPeriodEnd
                      ? `Trial access stays active until ${currentPeriodEnd}.`
                      : billingStatus === "ACTIVE"
                        ? "You can switch plans anytime and Stripe will handle the billing update."
                        : hasUsedTrial
                          ? "Pick a paid plan to unlock replies, automation, and billing access again."
                          : "Start with a free trial, then keep the momentum going with the plan that fits your volume."}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2.5">
                {backgroundRefreshing && (
                  <span className="text-xs font-semibold text-blue-500 animate-pulse bg-blue-50/80 px-2 py-1 rounded-lg border border-blue-100">
                    Syncing...
                  </span>
                )}
                {subscription?.stripeSubscriptionId && (
                  <LoadingButton
                    onClick={handleManageBilling}
                    loading={portalLoading}
                    loadingLabel="Opening..."
                    className="rounded-xl border border-blue-100 bg-blue-50/80 px-3.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
                  >
                    Manage Billing
                  </LoadingButton>
                )}
                <span className="brand-chip brand-chip-success">
                  <ShieldCheck size={13} />
                  Secure billing
                </span>
              </div>
            </div>
          </div>

          {isEntitlementKnown && billingContext && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 mb-6">
              <div className="bg-white/80 border border-slate-100 rounded-2xl p-4 shadow-sm">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Team Seats</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {(billingContext as any).seatCount ?? 0} / {(billingContext as any).seatLimit ?? 1}
                </p>
                <p className="text-xs text-slate-500 mt-1">Active workspace members</p>
              </div>
              <div className="bg-white/80 border border-slate-100 rounded-2xl p-4 shadow-sm">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">AI Credits Balance</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {((billingContext as any).creditBalance ?? 0).toLocaleString()}
                </p>
                <p className="text-xs text-slate-500 mt-1">Available for replies and decisions</p>
              </div>
              <div className="bg-white/80 border border-slate-100 rounded-2xl p-4 shadow-sm">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Monetization Plan</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {subscription?.plan?.name || "None"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {subscription?.plan?.name?.toUpperCase().startsWith("ENTERPRISE") 
                    ? "Custom Enterprise Contract" 
                    : "Standard Self-Serve Plan"}
                </p>
              </div>
            </div>
          )}

          <div id="plans" className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => {
              const displayPrice =
                billing === "monthly"
                  ? plan.monthlyPrice[currency]
                  : plan.yearlyPrice[currency];
              const current = isCurrentPlan(subscription, plan.type, planKey);

              return (
                <div
                  key={plan.type}
                  className={`relative rounded-2xl border bg-white/85 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg ${
                    plan.popular ? "border-blue-300" : "border-blue-100"
                  }`}
                >
                  {plan.popular ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-1 text-xs font-semibold text-white">
                      Most popular
                    </span>
                  ) : null}

                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900">
                          {plan.name}
                        </h2>
                        <p className="mt-1 text-sm text-gray-500">
                          {plan.description}
                        </p>
                      </div>

                      {current ? (
                        <span className="rounded-md bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                          Active
                        </span>
                      ) : null}
                    </div>

                    <div>
                      <div className="flex items-end gap-2">
                        <span className="text-3xl font-bold text-gray-900">
                          {formatMoney(displayPrice, currency)}
                        </span>
                        <span className="pb-1 text-sm text-gray-500">
                          /{billing}
                        </span>
                      </div>
                      <p className="mt-2 text-xs font-medium text-blue-600">
                        Includes {plan.limits.aiDailyLimit} AI replies per day
                      </p>
                    </div>

                    <div className="rounded-xl bg-blue-50/70 p-3 text-xs text-slate-600">
                      <p>{plan.limits.contactsLimit.toLocaleString()} contacts included</p>
                      <p className="mt-1">
                        {plan.limits.aiMonthlyLimit.toLocaleString()} AI replies per month
                      </p>
                      <p className="mt-1">
                        {plan.limits.messageLimit === -1
                          ? "Unlimited monthly messages"
                          : `${plan.limits.messageLimit.toLocaleString()} messages per month`}
                      </p>
                    </div>

                    <ul className="space-y-2 text-sm text-gray-700">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex gap-2">
                          <span className="text-blue-500">+</span>
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>

                   <LoadingButton
                    onClick={current && (subscription?.status === "PAUSED" || subscription?.status === "PAST_DUE") ? handleManageBilling : () => handleCheckout(plan.type)}
                    loading={current && (subscription?.status === "PAUSED" || subscription?.status === "PAST_DUE") ? portalLoading : loading === plan.type}
                    loadingLabel={current && (subscription?.status === "PAUSED" || subscription?.status === "PAST_DUE") ? "Opening..." : "Redirecting to secure checkout..."}
                    disabled={Boolean(loading) || portalLoading || (isEntitlementKnown && current && subscription?.status !== "PAUSED" && subscription?.status !== "PAST_DUE")}
                    className={`mt-6 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                      isEntitlementKnown && current && subscription?.status !== "PAUSED" && subscription?.status !== "PAST_DUE"
                        ? "bg-gray-200 text-gray-600"
                        : "bg-[linear-gradient(135deg,#081223_0%,#0b2a5b_55%,#1e5eff_100%)] text-white hover:shadow-lg"
                    }`}
                  >
                    {!isEntitlementKnown
                      ? `Choose ${plan.name}`
                      : current
                      ? subscription?.status === "PAUSED"
                        ? "Resume"
                        : subscription?.status === "PAST_DUE"
                        ? "Renew"
                        : "Current Plan"
                      : planKey === "FREE_LOCKED" || planKey === "LOCKED"
                        ? hasUsedTrial
                          ? "Buy Now"
                          : "Start Free Trial"
                        : (() => {
                            const rank: Record<string, number> = { BASIC: 1, PRO: 2, ELITE: 3 };
                            const currentRank = rank[planKey] || 0;
                            const targetRank = rank[plan.type] || 0;
                            return targetRank < currentRank ? "Downgrade" : "Upgrade Now";
                          })()}
                  </LoadingButton>

                  <p className="mt-3 text-xs text-gray-500">
                    {!isEntitlementKnown
                      ? "Need more headroom? Buy extra AI credits anytime."
                      : planKey === "FREE_LOCKED" || planKey === "LOCKED"
                        ? hasUsedTrial
                          ? "Need more flexibility? Buy extra AI credits anytime."
                          : `${plansResponse.trialDays} day free trial applies on the first checkout only.`
                        : "Need more headroom? Buy extra AI credits anytime."}
                  </p>
                </div>
              );
            })}

            {plans.length === 0 ? (
              <div className="rounded-2xl border border-slate-200/80 bg-white/86 p-6 text-sm text-slate-600 sm:col-span-2 xl:col-span-3">
                {plansRequestFailed
                  ? "Plan options are temporarily unavailable. Your billing state and payment history are still accessible below."
                  : "Plan options are still syncing. Safe defaults are shown as soon as available."}
              </div>
            ) : null}
          </div>

          {plansResponse.addons?.length ? (
            <div className="brand-section-shell rounded-[26px] p-5">
              <h3 className="text-base font-semibold text-gray-900">
                Extra AI credits
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Top up when conversations spike without changing your base plan.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                {plansResponse.addons.map((addon) => (
                  <div
                    key={addon.type}
                    className="rounded-[20px] border border-slate-200/80 bg-white/84 p-4 shadow-sm"
                  >
                    <p className="text-sm font-semibold text-slate-950">
                      {addon.label}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {addon.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="brand-section-shell rounded-[28px] p-5">
          {invoicesLoading ? (
            <div className="space-y-4">
              <SkeletonCard className="h-16" />
              <SkeletonCard className="h-16" />
              <SkeletonCard className="h-16" />
            </div>
          ) : (
            <PaymentHistory invoices={invoices} />
          )}
        </div>
      )}
    </div>
  );
}

function BillingPageSkeleton() {
  return (
    <div className="space-y-6">
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
