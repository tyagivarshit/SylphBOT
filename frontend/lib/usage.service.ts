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

export async function getUsageOverview(): Promise<UsageOverviewData | null> {
  try {
    const response = await apiClient.get<UsageOverviewData>("/usage", {
      headers: {
        "Cache-Control": "no-store",
      },
    });

    return response.data;
  } catch (error: unknown) {
    console.error("Failed to load usage overview:", {
      status: getApiErrorStatus(error),
      message: getApiErrorMessage(error, "Failed to load usage overview"),
    });

    return null;
  }
}
