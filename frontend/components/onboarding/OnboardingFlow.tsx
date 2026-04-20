"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Sparkles, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import DemoChatPreview from "./DemoChatPreview";
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
  description: string;
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
      description: "Connect Instagram or WhatsApp to start the live flow.",
      done: connected,
      current: currentStep === 1,
    },
    {
      number: 2,
      title: "See the demo reply",
      description: "Watch the AI answer a real routed demo message.",
      done: demoReady,
      current: currentStep === 2,
    },
    {
      number: 3,
      title: "Send a test message",
      description: `Send a DM from ${getPlatformLabel(data.primaryPlatform)} to trigger a real reply.`,
      done: demoReady,
      current: currentStep === 3,
    },
    {
      number: 4,
      title: "Review the first real reply",
      description: "Confirm your first live AI conversation landed correctly.",
      done: realReady,
      current: currentStep === 4,
    },
    {
      number: 5,
      title: "Complete onboarding",
      description: "Your workspace is ready to convert leads automatically.",
      done: complete,
      current: currentStep === 5,
    },
  ];
};

const getStepCopy = (data: OnboardingSnapshot) => {
  if (!data.checklist.connectedAccount) {
    return {
      title: "Connect your first channel",
      body: "Start by connecting Instagram or WhatsApp. As soon as it connects, we will generate a real AI-powered demo in this workspace.",
      primaryHref: "/settings" as OnboardingHref,
      primaryLabel: "Connect account",
      secondaryHref: "/settings" as OnboardingHref,
      secondaryLabel: "Open settings",
    };
  }

  if (!data.checklist.demoReplyReady) {
    return {
      title: "Your demo is being prepared",
      body: "We already sent a simulated inbound message through the live router. The AI bubble below will appear as soon as the pipeline finishes.",
      primaryHref: "/conversations" as OnboardingHref,
      primaryLabel: "Open inbox",
      secondaryHref: "/settings" as OnboardingHref,
      secondaryLabel: "Manage channels",
    };
  }

  if (!data.checklist.realReplyReady) {
    return {
      title: "Send one real test message",
      body: `Send a message from ${getPlatformLabel(data.primaryPlatform)} and we will detect the first live AI reply automatically.`,
      primaryHref: "/conversations" as OnboardingHref,
      primaryLabel: "Watch conversations",
      secondaryHref: "/settings" as OnboardingHref,
      secondaryLabel: "Review integrations",
    };
  }

  return {
      title: "Your AI is live",
      body: "The first real reply has landed and onboarding is complete. Keep the automation running so new leads keep getting instant responses.",
      primaryHref: "/conversations" as OnboardingHref,
      primaryLabel: "Open conversations",
      secondaryHref: "/billing" as OnboardingHref,
      secondaryLabel: "Upgrade now",
    };
  };

export default function OnboardingFlow() {
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);

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

  useEffect(() => {
    if (!onboarding || onboarding.onboardingCompleted) {
      return;
    }

    const integrationStatus = searchParams.get("integration");
    const onboardingFlag = searchParams.get("onboarding");
    const shouldOpen =
      integrationStatus === "success" ||
      onboardingFlag === "1" ||
      onboarding.onboardingStep > 1;

    if (shouldOpen) {
      setIsOpen(true);
    }
  }, [onboarding, searchParams]);

  if (!onboarding) {
    return null;
  }

  const stepItems = getStepItems(onboarding);
  const stepCopy = getStepCopy(onboarding);
  const completionPercent = Math.round((onboarding.onboardingStep / 5) * 100);

  return (
    <div className="space-y-5">
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
        <div className="brand-section-shell overflow-hidden rounded-[28px] p-5 md:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Onboarding
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">
                Launch your first AI success
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                {stepCopy.body}
              </p>
            </div>

            <button
              onClick={() => setIsOpen(true)}
              className="brand-button-primary shrink-0"
            >
              Open onboarding
            </button>
          </div>

          <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-400 transition-all duration-500"
              style={{ width: `${completionPercent}%` }}
            />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            {stepItems.map((step) => (
              <div
                key={step.number}
                className={`rounded-[22px] border px-4 py-3 shadow-sm ${
                  step.done
                    ? "border-emerald-200 bg-emerald-50/80"
                    : step.current
                      ? "border-blue-200 bg-blue-50/80"
                      : "border-slate-200/80 bg-white/84"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                      step.done
                        ? "bg-emerald-600 text-white"
                        : step.current
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {step.done ? <CheckCircle2 size={14} /> : step.number}
                  </span>
                  <p className="text-sm font-semibold text-slate-950">
                    {step.title}
                  </p>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {step.description}
                </p>
              </div>
            ))}
          </div>

          {onboarding.demo.aiMessage ? (
            <div className="mt-5">
              <DemoChatPreview
                title="Demo chat preview"
                label={onboarding.demo.label}
                preview={onboarding.demo}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {onboarding.realReply.aiMessage ? (
        <DemoChatPreview
          title="First real AI reply"
          label="Live customer conversation"
          preview={onboarding.realReply}
          loadingText="Waiting for the first live AI reply..."
        />
      ) : null}

      {isOpen && !onboarding.onboardingCompleted ? (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="brand-panel-strong w-full max-w-6xl rounded-[32px] p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Guided onboarding
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  {stepCopy.title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-600">
                  {stepCopy.body}
                </p>
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white/86 text-slate-500 transition hover:text-slate-900"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
              <div className="rounded-[26px] border border-slate-200/80 bg-white/84 p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                  <Sparkles size={16} className="text-blue-600" />
                  Step {onboarding.onboardingStep} of 5
                </div>

                <div className="mt-4 space-y-3">
                  {stepItems.map((step) => (
                    <div
                      key={step.number}
                      className={`rounded-[20px] border px-3 py-3 ${
                        step.done
                          ? "border-emerald-200 bg-emerald-50/80"
                          : step.current
                            ? "border-blue-200 bg-blue-50/80"
                            : "border-slate-200/80 bg-slate-50/75"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                            step.done
                              ? "bg-emerald-600 text-white"
                              : step.current
                                ? "bg-blue-600 text-white"
                                : "bg-white text-slate-500"
                          }`}
                        >
                          {step.done ? <CheckCircle2 size={13} /> : step.number}
                        </span>
                        <p className="text-sm font-semibold text-slate-950">
                          {step.title}
                        </p>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-600">
                        {step.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <DemoChatPreview
                  title="Demo chat preview"
                  label={onboarding.demo.label}
                  preview={onboarding.demo}
                />

                {onboarding.realReply.aiMessage ? (
                  <DemoChatPreview
                    title="First real AI reply"
                    label="Live customer conversation"
                    preview={onboarding.realReply}
                    loadingText="Waiting for the first live AI reply..."
                  />
                ) : (
                  <div className="rounded-[26px] border border-dashed border-slate-300/90 bg-white/74 p-5 text-sm text-slate-600">
                    Send one test message from {getPlatformLabel(onboarding.primaryPlatform)} and this
                    panel will switch from demo mode to your first live AI result.
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link href={stepCopy.primaryHref} className="brand-button-primary">
                    {stepCopy.primaryLabel}
                  </Link>
                  <Link
                    href={stepCopy.secondaryHref}
                    className="brand-button-secondary"
                  >
                    {stepCopy.secondaryLabel}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
