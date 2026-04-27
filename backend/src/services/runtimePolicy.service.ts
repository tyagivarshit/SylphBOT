import { env } from "../config/env";

export const isPhase5APreviewBypassEnabled = () =>
  env.PHASE5A_PREVIEW_BYPASS_ENABLED;

export const isPhase5ALegacyRuntimeEnabled = () =>
  env.PHASE5A_LEGACY_RUNTIME_ENABLED;

export const assertPhase5APreviewBypassEnabled = (operation: string) => {
  if (isPhase5APreviewBypassEnabled()) {
    return;
  }

  throw new Error(`phase5a_preview_only:${operation}`);
};

export const assertPhase5ALegacyRuntimeEnabled = (operation: string) => {
  if (isPhase5ALegacyRuntimeEnabled()) {
    return;
  }

  throw new Error(`phase5a_legacy_disabled:${operation}`);
};
