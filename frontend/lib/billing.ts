import { apiFetch } from "@/lib/apiClient";

type BillingRequestResult = {
  success?: boolean;
  url?: string;
  message?: string;
};

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
  } catch (error: any) {
    const isAbort = error?.name === "AbortError";

    throw new Error(isAbort ? "Request timeout" : error?.message || "Network error");
  } finally {
    clearTimeout(id);
  }
};

export const createCheckoutSession = async (
  plan: string,
  billing: "monthly" | "yearly"
): Promise<BillingRequestResult> => {
  try {
    const data = await requestWithTimeout<{ url?: string }>(
      "/api/billing/create-checkout-session",
      {
        method: "POST",
        body: JSON.stringify({ plan, billing }),
      }
    );

    if (!data?.url) {
      throw new Error("No checkout URL received");
    }

    return data;
  } catch (error: any) {
    console.error("Checkout API error:", error);

    return {
      success: false,
      message: error.message || "Checkout failed",
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
    return await requestWithTimeout(
      `/api/billing/checkout/confirm?session_id=${encodeURIComponent(
        sessionId
      )}`,
      {
        method: "GET",
      },
      15000
    );
  } catch (error: any) {
    console.error("Checkout confirmation error:", error);

    return {
      success: false,
      message: error.message || "Checkout confirmation failed",
    };
  }
};
