"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { recordLifecycleEvent } from "@/lib/lifecycleTelemetry";

type ProgressiveHydrationOptions = {
  authStable: boolean;
  criticalSettled: boolean;
  importantSettled: boolean;
};

export function useProgressiveHydration({
  authStable,
  criticalSettled,
  importantSettled,
}: ProgressiveHydrationOptions) {
  const [deferredRequested, setDeferredRequested] = useState(false);

  const shellRenderedRef = useRef(false);
  const authStabilizedRef = useRef(false);
  const criticalStartedRef = useRef(false);
  const criticalCompletedRef = useRef(false);
  const deferredStartedRef = useRef(false);
  const deferredCompletedRef = useRef(false);

  useEffect(() => {
    if (shellRenderedRef.current) {
      return;
    }

    shellRenderedRef.current = true;
    recordLifecycleEvent("shell_rendered");
  }, []);

  useEffect(() => {
    if (!authStable || authStabilizedRef.current) {
      return;
    }

    authStabilizedRef.current = true;
    recordLifecycleEvent("auth_stabilized");
  }, [authStable]);

  const canLoadCritical = authStable;
  const canLoadImportant = authStable && criticalSettled;
  const canLoadDeferred =
    authStable && criticalSettled && importantSettled && deferredRequested;

  useEffect(() => {
    if (!canLoadCritical || criticalStartedRef.current) {
      return;
    }

    criticalStartedRef.current = true;
    recordLifecycleEvent("critical_hydration_start");
  }, [canLoadCritical]);

  useEffect(() => {
    if (!criticalSettled || criticalCompletedRef.current) {
      return;
    }

    criticalCompletedRef.current = true;
    recordLifecycleEvent("critical_hydration_complete");
  }, [criticalSettled]);

  useEffect(() => {
    if (!canLoadDeferred || deferredStartedRef.current) {
      return;
    }

    deferredStartedRef.current = true;
    recordLifecycleEvent("deferred_hydration_start");
  }, [canLoadDeferred]);

  const requestDeferredHydration = useCallback((reason: string) => {
    setDeferredRequested((current) => {
      if (current) {
        return current;
      }

      recordLifecycleEvent("lazy_hydration_triggered", { reason });
      return true;
    });
  }, []);

  const markDeferredHydrationComplete = useCallback((source: string) => {
    if (deferredCompletedRef.current) {
      return;
    }

    deferredCompletedRef.current = true;
    recordLifecycleEvent("deferred_hydration_complete", { source });
  }, []);

  return useMemo(
    () => ({
      canLoadCritical,
      canLoadImportant,
      canLoadDeferred,
      requestDeferredHydration,
      markDeferredHydrationComplete,
    }),
    [
      canLoadCritical,
      canLoadImportant,
      canLoadDeferred,
      markDeferredHydrationComplete,
      requestDeferredHydration,
    ]
  );
}

