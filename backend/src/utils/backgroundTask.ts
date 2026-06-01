import { runOutsideRequestContext } from "../observability/requestContext";
import { requestStorage } from "./requestLifecycle";

export const runDetachedBackgroundTask = (
  label: string,
  task: () => Promise<unknown> | unknown,
  onError?: (error: unknown) => void
) => {
  setImmediate(() => {
    requestStorage.exit(() => {
      runOutsideRequestContext(() => {
        Promise.resolve()
          .then(task)
          .catch((error) => {
            if (onError) {
              onError(error);
              return;
            }
            console.warn("BACKGROUND_TASK_FAILED", {
              label,
              reason: String((error as Error)?.message || error || "unknown"),
            });
          });
      });
    });
  });
};
