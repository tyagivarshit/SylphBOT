export type LifecycleEventName =
  | "auth_stabilized"
  | "shell_rendered"
  | "critical_hydration_start"
  | "critical_hydration_complete"
  | "deferred_hydration_start"
  | "deferred_hydration_complete"
  | "duplicate_request_prevented"
  | "polling_backoff_applied"
  | "stale_response_ignored"
  | "lazy_hydration_triggered";

type LifecycleMetadata = Record<string, unknown>;

export function recordLifecycleEvent(
  event: LifecycleEventName,
  metadata: LifecycleMetadata = {}
) {
  if (typeof window === "undefined") {
    return;
  }

  console.info("lifecycle_event", {
    event,
    recordedAt: new Date().toISOString(),
    metadata,
  });
}
