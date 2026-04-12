"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

const DISMISS_KEY = "automexia:pwa-install-dismissed-at";
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

const isStandaloneMode = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean(
      (
        window.navigator as Navigator & {
          standalone?: boolean;
        }
      ).standalone
    )
  );
};

const shouldHidePrompt = () => {
  if (typeof window === "undefined") {
    return true;
  }

  if (isStandaloneMode()) {
    return true;
  }

  const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
  return dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_TTL_MS;
};

export default function PWAInstallPrompt() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    if (shouldHidePrompt()) {
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      const deferredEvent = event as BeforeInstallPromptEvent;
      deferredEvent.preventDefault();
      setInstallPrompt(deferredEvent);
      setVisible(true);
    };

    const onAppInstalled = () => {
      window.localStorage.removeItem(DISMISS_KEY);
      setInstallPrompt(null);
      setVisible(false);
    };

    window.addEventListener(
      "beforeinstallprompt",
      onBeforeInstallPrompt as EventListener
    );
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        onBeforeInstallPrompt as EventListener
      );
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const dismissPrompt = () => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  const installApp = async () => {
    if (!installPrompt) {
      return;
    }

    setInstalling(true);

    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;

      if (outcome !== "accepted") {
        window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
      }

      setVisible(false);
      setInstallPrompt(null);
    } finally {
      setInstalling(false);
    }
  };

  if (!visible || !installPrompt) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 z-[90] w-[calc(100vw-1.5rem)] max-w-3xl -translate-x-1/2"
      style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <div className="pointer-events-auto rounded-[24px] border border-white/80 bg-white/95 p-3 shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#081223_0%,#0b2a5b_55%,#1e5eff_100%)] text-white shadow-[0_14px_28px_rgba(15,23,42,0.18)]">
              <Download size={18} />
            </div>

            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 sm:text-[15px]">
                Install our app for a better experience
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600 sm:text-sm">
                Add Automexia AI to your home screen for faster access and a
                cleaner app-style experience.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={dismissPrompt}
              className="brand-button-secondary min-h-11 flex-1 px-4 py-2.5 text-sm sm:flex-none"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={installApp}
              disabled={installing}
              className="brand-button-primary min-h-11 flex-1 px-4 py-2.5 text-sm sm:flex-none"
            >
              {installing ? "Opening..." : "Install app"}
            </button>
            <button
              type="button"
              onClick={dismissPrompt}
              aria-label="Dismiss install prompt"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(77,163,255,0.2)]"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
