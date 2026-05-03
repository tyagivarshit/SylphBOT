import { apiFetch } from "@/lib/apiClient";

type BillingRequestResult = {
  success?: boolean;
  url?: string;
  message?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const requestWithTimeout = async <T>(
  path: string,
  options: RequestInit,
  timeout = 10000
) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await apiFetch<T>(path, {
      ...options,
      signal: controller.signal,
    });

    if (!response.success || response.data == null) {
      throw new Error(response.message || "Request failed");
    }

    return response.data;
  } catch (error: unknown) {
    throw new Error(getErrorMessage(error, "Network error"));
  } finally {
    clearTimeout(id);
  }
};

const requestWithRetry = async <T>(
  path: string,
  options: RequestInit,
  timeout = 10000,
  retries = 1
) => {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= retries) {
    try {
      return await requestWithTimeout<T>(path, options, timeout);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Request failed");
      attempt += 1;

      if (attempt > retries) {
        break;
      }

      await sleep(300 * attempt);
    }
  }

  throw lastError || new Error("Request failed");
};

const resolveCheckoutUrl = (value: unknown) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;

  if (typeof row.url === "string" && row.url.trim()) {
    return row.url.trim();
  }

  if (row.data && typeof row.data === "object") {
    const nested = row.data as Record<string, unknown>;
    if (typeof nested.url === "string" && nested.url.trim()) {
      return nested.url.trim();
    }
  }

  return null;
};

export const createCheckoutSession = async (
  plan: string,
  billing: "monthly" | "yearly"
): Promise<BillingRequestResult> => {
  try {
    const data = await requestWithRetry<Record<string, unknown>>(
      "/api/billing/create-checkout-session",
      {
        method: "POST",
        body: JSON.stringify({ plan, billing }),
      },
      15000,
      1
    );
    const url = resolveCheckoutUrl(data);

    if (!url) {
      throw new Error("No checkout URL received");
    }

    return {
      success: true,
      url,
    };
  } catch (error: unknown) {
    console.error("Checkout API error:", error);

    return {
      success: false,
      message: getErrorMessage(error, "Checkout failed"),
    };
  }
};

export const createCheckout = async (
  plan: string,
  billing: "monthly" | "yearly"
) => createCheckoutSession(plan, billing);

export const upgradePlan = async (
  plan: string,
  billing: "monthly" | "yearly"
) => createCheckoutSession(plan, billing);

export const confirmCheckout = async (
  sessionId: string
): Promise<Record<string, unknown>> => {
  try {
    return await requestWithRetry(
      `/api/billing/checkout/confirm?session_id=${encodeURIComponent(
        sessionId
      )}`,
      {
        method: "GET",
      },
      18000,
      2
    );
  } catch (error: unknown) {
    console.error("Checkout confirmation error:", error);

    return {
      success: false,
      message: getErrorMessage(error, "Checkout confirmation failed"),
    };
  }
};
