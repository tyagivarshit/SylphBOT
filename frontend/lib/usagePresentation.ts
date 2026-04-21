type UsageInput = {
  plan?: string | null;
  planLabel?: string | null;
  warningMessage?: string | null;
  addonCredits?: number | null;
  ai?: {
    usedToday?: number | null;
    limit?: number | null;
    remaining?: number | null;
  } | null;
  addons?: {
    aiCredits?: number | null;
  } | null;
} | null;

export type UsagePresentation = {
  aiUsedToday: number;
  aiLimit: number;
  aiRemaining: number;
  addonCredits: number;
  aiPercent: number;
  dailyLimitReached: boolean;
  aiDisabled: boolean;
  nearLimit: boolean;
  planLabel: string;
  notice: null | {
    tone: "danger" | "warning";
    title: string;
    message: string;
  };
};

export function getUsagePresentation(usage: UsageInput): UsagePresentation {
  const aiUsedToday = usage?.ai?.usedToday ?? 0;
  const aiLimit = usage?.ai?.limit ?? 0;
  const aiRemaining = usage?.ai?.remaining ?? 0;
  const addonCredits = usage?.addonCredits ?? usage?.addons?.aiCredits ?? 0;
  const aiPercent =
    aiLimit > 0
      ? Math.min(Math.round((aiUsedToday / aiLimit) * 100), 100)
      : 0;
  const dailyLimitReached = aiRemaining <= 0;
  const aiDisabled = dailyLimitReached && addonCredits <= 0;
  const nearLimit = !aiDisabled && aiPercent >= 80;
  const planLabel = usage?.planLabel || usage?.plan || "Current plan";

  let notice: UsagePresentation["notice"] = null;

  if (aiDisabled) {
    notice = {
      tone: "danger",
      title: "You've used all your AI replies for today",
      message:
        "Buy extra credits to keep replying now, or upgrade for a larger daily allowance.",
    };
  } else if (dailyLimitReached && addonCredits > 0) {
    notice = {
      tone: "warning",
      title: "Your daily AI replies are used up",
      message:
        "New AI replies will now use your extra credits automatically.",
    };
  } else if (nearLimit) {
    notice = {
      tone: "warning",
      title: "You're close to today's AI reply limit",
      message:
        usage?.warningMessage ||
        "Top up credits or upgrade before replies slow down.",
    };
  }

  return {
    aiUsedToday,
    aiLimit,
    aiRemaining,
    addonCredits,
    aiPercent,
    dailyLimitReached,
    aiDisabled,
    nearLimit,
    planLabel,
    notice,
  };
}
