import { apiFetch } from "./apiClient";

export type OnboardingPreviewMessage = {
  id: string;
  content: string;
  createdAt: string;
};

export type OnboardingChatPreview = {
  leadId: string | null;
  userMessage: OnboardingPreviewMessage | null;
  aiMessage: OnboardingPreviewMessage | null;
};

export type OnboardingSnapshot = {
  onboardingCompleted: boolean;
  onboardingStep: number;
  demoCompleted: boolean;
  connectedPlatforms: Array<{
    id: string;
    platform: string;
  }>;
  primaryPlatform: string | null;
  checklist: {
    connectedAccount: boolean;
    demoReplyReady: boolean;
    sendTestPromptReady: boolean;
    realReplyReady: boolean;
  };
  demo: OnboardingChatPreview & {
    label: string;
    prompt: string;
  };
  realReply: OnboardingChatPreview;
  trial: {
    active: boolean;
    totalDays: number;
    daysLeft: number;
    nearEnd: boolean;
  };
  usage: {
    aiUsedToday: number;
    aiLimit: number;
    aiRemaining: number | null;
    aiUsagePercent: number;
    warning: boolean;
    warningMessage?: string | null;
  };
  upgrade: {
    show: boolean;
    reasons: string[];
    headline: string;
    message: string;
    ctaHref: "/billing";
  };
};

export const getOnboardingSnapshot = async () =>
  apiFetch<OnboardingSnapshot>("/api/integrations/onboarding");
