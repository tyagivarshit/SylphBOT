import { apiClient, getApiErrorMessage, getApiErrorStatus } from "@/lib/apiClient";

export type UsageOverviewData = {
  plan: string;
  planLabel?: string;
  trialActive: boolean;
  daysLeft: number;
  warning?: boolean;
  warningMessage?: string | null;
  addonCredits?: number;
  ai: {
    usedToday: number;
    limit: number;
    remaining: number | null;
  };
  usage: {
    ai: {
      used: number;
      dailyLimit: number;
      monthlyUsed: number;
      monthlyLimit: number;
      dailyRemaining?: number | null;
      warning?: boolean;
    };
    contacts: {
      used: number;
      limit: number;
    };
    messages: {
      used: number;
      limit: number;
    };
    automation?: {
      used: number;
      limit: number;
      remaining: number | null;
    };
  };
  addons: {
    aiCredits: number;
    contacts?: number;
  };
};

const USAGE_OVERVIEW_CACHE_TTL_MS = 8_000;

let usageOverviewCache:
  | {
      value: UsageOverviewData | null;
      expiresAt: number;
      promise?: Promise<UsageOverviewData | null>;
    }
  | null = null;

export async function getUsageOverview(options?: {
  forceRefresh?: boolean;
}): Promise<UsageOverviewData | null> {
  const forceRefresh = Boolean(options?.forceRefresh);
  if (
    !forceRefresh &&
    usageOverviewCache?.value &&
    usageOverviewCache.expiresAt > Date.now()
  ) {
    return usageOverviewCache.value;
  }

  if (!forceRefresh && usageOverviewCache?.promise) {
    return usageOverviewCache.promise;
  }

  const requestPromise = (async () => {
  try {
      const response = await apiClient.get<UsageOverviewData>("/usage");
      const payload = response.data;
      usageOverviewCache = {
        value: payload,
        expiresAt: Date.now() + USAGE_OVERVIEW_CACHE_TTL_MS,
      };
      return payload;
  } catch (error: unknown) {
    console.error("Failed to load usage overview:", {
      status: getApiErrorStatus(error),
      message: getApiErrorMessage(error, "Failed to load usage overview"),
    });

    return null;
  }
  })();

  usageOverviewCache = {
    value: usageOverviewCache?.value || null,
    expiresAt: usageOverviewCache?.expiresAt || 0,
    promise: requestPromise,
  };

  const response = await requestPromise;
  if (!response) {
    usageOverviewCache = null;
  }
  return response;
}
