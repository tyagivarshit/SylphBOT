"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Coins, ShieldCheck, Sparkles } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { TrustSignals } from "@/components/ui/feedback";

type UpgradeModalVariant = "feature" | "usage_limit";

type OpenUpgradeOptions = {
  variant?: UpgradeModalVariant;
  title?: string;
  description?: string;
  remainingCredits?: number;
  addonCredits?: number;
};

type UpgradeContextValue = {
  openUpgrade: (options?: OpenUpgradeOptions) => void;
  closeUpgrade: () => void;
};

const UpgradeContext = createContext<UpgradeContextValue | null>(null);

export function useUpgrade() {
  const context = useContext(UpgradeContext);

  if (!context) {
    throw new Error("useUpgrade must be used within DashboardLayout");
  }

  return context;
}

function AuthStateCard({ message }: { message: string }) {
  return (
    <div className="brand-app brand-shell">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="brand-panel-strong w-full max-w-md rounded-[32px] p-8 text-center">
          <div className="space-y-3">
            <div className="h-2 w-24 animate-pulse rounded-full bg-slate-200/80 mx-auto" />
            <div className="h-2 w-40 animate-pulse rounded-full bg-slate-200/70 mx-auto" />
            <div className="h-2 w-32 animate-pulse rounded-full bg-slate-200/60 mx-auto" />
          </div>
          <p className="mt-5 text-sm text-slate-500">{message}</p>
        </div>
      </div>
    </div>
  );
}

function ShellHydrationPlaceholder({ message }: { message: string }) {
  return (
    <div className="space-y-5">
      <div className="brand-section-shell rounded-[28px] p-5">
        <div className="space-y-3">
          <div className="h-2 w-36 animate-pulse rounded-full bg-slate-200/85" />
          <div className="h-2 w-52 animate-pulse rounded-full bg-slate-200/75" />
          <div className="h-2 w-44 animate-pulse rounded-full bg-slate-200/65" />
        </div>
        <p className="mt-4 text-sm text-slate-500">{message}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-[24px] border border-slate-200/80 bg-white/78"
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-72 animate-pulse rounded-[26px] border border-slate-200/80 bg-white/80 lg:col-span-2" />
        <div className="h-72 animate-pulse rounded-[26px] border border-slate-200/80 bg-white/80" />
      </div>
    </div>
  );
}

function UpgradeModal({
  state,
  onClose,
}: {
  state: OpenUpgradeOptions | null;
  onClose: () => void;
}) {
  const variant = state?.variant ?? "feature";
  const isUsageLimit = variant === "usage_limit";
  const remainingCredits = state?.remainingCredits ?? 0;
  const addonCredits = state?.addonCredits ?? 0;

  const content = isUsageLimit
    ? {
        eyebrow: "Usage limit",
        title:
          state?.title || "You've used all your AI replies for today",
        description:
          state?.description ||
          "Buy extra credits to keep replying now, or upgrade for a larger daily allowance.",
        primaryLabel: "Buy Credits",
        secondaryLabel: "Upgrade Plan",
        icon: <Coins size={14} />,
        chipClassName:
          "inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800",
      }
    : {
        eyebrow: "Premium access",
        title: state?.title || "Unlock this feature on a higher plan",
        description:
          state?.description ||
          "Upgrade to unlock advanced automation, CRM visibility, and AI growth features as your workspace scales.",
        primaryLabel: "Upgrade Plan",
        secondaryLabel: "Maybe later",
        icon: <ShieldCheck size={14} />,
        chipClassName:
          "inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800",
      };

  if (!state) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="brand-panel-strong w-full max-w-xl rounded-[32px] p-6 sm:p-7">
        <span className={content.chipClassName}>
          {content.icon}
          {content.eyebrow}
        </span>

        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">
          {content.title}
        </h2>

        <p className="mt-3 text-sm leading-6 text-slate-500">
          {content.description}
        </p>

        {isUsageLimit ? (
          <div className="mt-5 grid gap-3 rounded-[24px] border border-slate-200/80 bg-white/88 p-4 sm:grid-cols-2">
            <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Remaining credits
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {remainingCredits}
              </p>
            </div>

            <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Extra credits available
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {addonCredits}
              </p>
            </div>
          </div>
        ) : null}

        <TrustSignals className="mt-5" />

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
          {isUsageLimit ? (
            <button onClick={onClose} className="brand-button-secondary flex-1">
              Not now
            </button>
          ) : (
            <button onClick={onClose} className="brand-button-secondary flex-1">
              {content.secondaryLabel}
            </button>
          )}

          {isUsageLimit ? (
            <>
              <Link href="/billing" onClick={onClose} className="brand-button-secondary flex-1">
                {content.primaryLabel}
              </Link>
              <Link href="/billing#plans" onClick={onClose} className="brand-button-primary flex-1">
                <Sparkles size={15} />
                {content.secondaryLabel}
              </Link>
            </>
          ) : (
            <Link href="/billing#plans" onClick={onClose} className="brand-button-primary flex-1">
              <Sparkles size={15} />
              {content.primaryLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, loading, lifecycleState } = useAuth();
  const router = useRouter();
  const authConverging =
    loading ||
    lifecycleState === "authenticating" ||
    lifecycleState === "session_stabilizing" ||
    lifecycleState === "retrying" ||
    lifecycleState === "authenticated";
  const terminalAnonymous =
    !user &&
    (lifecycleState === "failed_terminal" || lifecycleState === "anonymous");
  const holdChildHydration = loading && !user;

  const [open, setOpen] = useState(false);
  const [upgradeState, setUpgradeState] = useState<OpenUpgradeOptions | null>(null);

  useEffect(() => {
    if (authConverging) {
      return;
    }

    if (terminalAnonymous) {
      router.replace("/auth/login");
    }
  }, [authConverging, router, terminalAnonymous]);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setUpgradeState(null);
      }
    };

    window.addEventListener("keydown", handleEsc);

    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open || Boolean(upgradeState) ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [open, upgradeState]);

  const upgradeContextValue = useMemo<UpgradeContextValue>(
    () => ({
      openUpgrade: (options = {}) => {
        setUpgradeState({
          variant: options.variant ?? "feature",
          ...options,
        });
      },
      closeUpgrade: () => setUpgradeState(null),
    }),
    []
  );

  if (terminalAnonymous) {
    const message = "Redirecting to secure sign-in...";
    return <AuthStateCard message={message} />;
  }

  const shellMessage = holdChildHydration
    ? lifecycleState === "authenticating"
      ? "Signing you in securely..."
      : lifecycleState === "authenticated"
      ? "Hydrating your workspace..."
      : "Stabilizing your workspace session..."
    : "";

  return (
    <UpgradeContext.Provider value={upgradeContextValue}>
      <div className="brand-app brand-shell">
        <div className="brand-layout-frame lg:h-[100dvh] lg:max-h-[100dvh] lg:overflow-hidden">
          <Sidebar open={open} setOpen={setOpen} />

          <div className="brand-page brand-main-column">
            <Topbar setOpen={setOpen} />

            <main className="brand-content-scroll brand-scrollbar">
              <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 pb-6 sm:gap-6">
                {holdChildHydration ? (
                  <ShellHydrationPlaceholder message={shellMessage} />
                ) : (
                  children
                )}
              </div>
            </main>
          </div>
        </div>
      </div>

      <UpgradeModal
        state={upgradeState}
        onClose={() => setUpgradeState(null)}
      />
    </UpgradeContext.Provider>
  );
}
