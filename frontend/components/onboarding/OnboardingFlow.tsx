"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import TrialBanner from "./TrialBanner";
import UpgradeCtaBanner from "./UpgradeCtaBanner";
import {
  getOnboardingSnapshot,
  type OnboardingSnapshot,
} from "@/lib/onboarding";
import { buildAppUrl } from "@/lib/url";

type StepItem = {
  number: number;
  title: string;
  done: boolean;
  current: boolean;
};

type OnboardingHref = Extract<Route, "/settings" | "/conversations" | "/billing">;

const getPlatformLabel = (platform?: string | null) => {
  if (platform === "WHATSAPP") {
    return "WhatsApp";
  }

  if (platform === "INSTAGRAM") {
    return "Instagram";
  }

  return "your account";
};

const getStepItems = (data: OnboardingSnapshot): StepItem[] => {
  const connected = data.checklist.connectedAccount;
  const demoReady = data.checklist.demoReplyReady;
  const realReady = data.checklist.realReplyReady;
  const complete = data.onboardingCompleted;
  const currentStep = data.onboardingStep;

  return [
    {
      number: 1,
      title: "Connect account",
      done: connected,
      current: currentStep === 1,
    },
    {
      number: 2,
      title: "Check demo",
      done: demoReady,
      current: currentStep === 2,
    },
    {
      number: 3,
      title: "Send test message",
      done: demoReady,
      current: currentStep === 3,
    },
    {
      number: 4,
      title: "Review live reply",
      done: realReady,
      current: currentStep === 4,
    },
    {
      number: 5,
      title: "Finish setup",
      done: complete,
      current: currentStep === 5,
    },
  ];
};

const getStepCopy = (data: OnboardingSnapshot) => {
  if (!data.checklist.connectedAccount) {
    return {
      title: "Connect your first channel",
      body: "Connect Instagram or WhatsApp to start live replies.",
      primaryHref: "/settings" as OnboardingHref,
      primaryLabel: "Connect account",
      secondaryHref: "/settings" as OnboardingHref,
      secondaryLabel: "Open settings",
    };
  }

  if (!data.checklist.demoReplyReady) {
    return {
      title: "Demo reply in progress",
      body: "Your first demo reply is being prepared.",
      primaryHref: "/conversations" as OnboardingHref,
      primaryLabel: "Open inbox",
      secondaryHref: "/settings" as OnboardingHref,
      secondaryLabel: "Review channels",
    };
  }

  if (!data.checklist.realReplyReady) {
    return {
      title: "Send one test message",
      body: `Send a message from ${getPlatformLabel(data.primaryPlatform)} to confirm live replies.`,
      primaryHref: "/conversations" as OnboardingHref,
      primaryLabel: "Open conversations",
      secondaryHref: "/settings" as OnboardingHref,
      secondaryLabel: "Review integrations",
    };
  }

  return {
    title: "AI replies are live",
    body: "Your first live reply has been confirmed.",
    primaryHref: "/conversations" as OnboardingHref,
    primaryLabel: "Open conversations",
    secondaryHref: "/billing" as OnboardingHref,
    secondaryLabel: "View billing",
  };
};

export default function OnboardingFlow() {
  const searchParams = useSearchParams();

  const onboardingQuery = useQuery({
    queryKey: ["integrations-onboarding"],
    queryFn: getOnboardingSnapshot,
    staleTime: 4000,
    refetchInterval: 8000,
  });

  const onboarding = onboardingQuery.data?.success
    ? onboardingQuery.data.data
    : null;

  useEffect(() => {
    const integrationStatus = searchParams.get("integration");
    const onboardingFlag = searchParams.get("onboarding");

    if (!integrationStatus && !onboardingFlag) {
      return;
    }

    window.history.replaceState({}, "", buildAppUrl("/dashboard"));
  }, [searchParams]);

  if (!onboarding) {
    return null;
  }

  const stepItems = getStepItems(onboarding);
  const stepCopy = getStepCopy(onboarding);
  const completionPercent = Math.round((onboarding.onboardingStep / 5) * 100);

  return (
    <div className="space-y-4">
      <TrialBanner
        active={onboarding.trial.active}
        totalDays={onboarding.trial.totalDays}
        daysLeft={onboarding.trial.daysLeft}
        nearEnd={onboarding.trial.nearEnd}
      />

      <UpgradeCtaBanner
        show={onboarding.upgrade.show}
        headline={onboarding.upgrade.headline}
        message={onboarding.upgrade.message}
        reasons={onboarding.upgrade.reasons}
        href={onboarding.upgrade.ctaHref}
      />

      {!onboarding.onboardingCompleted ? (
        <div className="brand-section-shell rounded-[28px] p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-slate-900 px-3 py-1.5 font-semibold text-white">
                  Step {onboarding.onboardingStep} of 5
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600">
                  {completionPercent}% complete
                </span>
              </div>
              <h2 className="mt-3 text-xl font-semibold text-slate-950">
                {stepCopy.title}
              </h2>
              <p className="mt-1 text-sm text-slate-600">{stepCopy.body}</p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href={stepCopy.primaryHref as any} className="brand-button-primary">
                {stepCopy.primaryLabel}
              </Link>
              <Link
                href={stepCopy.secondaryHref as any}
                className="brand-button-secondary"
              >
                {stepCopy.secondaryLabel}
              </Link>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {stepItems.map((step) => (
              <span
                key={step.number}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  step.done
                    ? "bg-emerald-50 text-emerald-700"
                    : step.current
                      ? "bg-blue-50 text-blue-700"
                      : "bg-slate-100 text-slate-600"
                }`}
              >
                {step.done ? <CheckCircle2 size={13} /> : step.number}
                {step.title}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
