import type { JobsOptions } from "bullmq";

export const QUEUE_REMOVE_ON_COMPLETE = {
  count: 1000,
} as const;

export const QUEUE_REMOVE_ON_FAIL = {
  count: 5000,
} as const;

export const buildQueueJobOptions = (
  overrides: Partial<JobsOptions> = {}
): JobsOptions => ({
  attempts: 3,
  removeOnComplete: QUEUE_REMOVE_ON_COMPLETE,
  removeOnFail: QUEUE_REMOVE_ON_FAIL,
  ...overrides,
});
