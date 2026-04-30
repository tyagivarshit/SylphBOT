import { Job, JobsOptions, Queue, Worker } from "bullmq";
import { env } from "../../config/env";
import {
  getQueueRedisConnection,
  getSharedRedisConnection,
  getWorkerRedisConnection,
} from "../../config/redis";
import { buildQueueJobOptions, withRedisWorkerFailSafe } from "../../queues/queue.defaults";
import logger from "../../utils/logger";
import { acquireDistributedLock } from "../distributedLock.service";
import { enforceSecurityGovernanceInfluence } from "../security/securityGovernanceOS.service";

export const CRM_REFRESH_QUEUE_NAME = "crm-intelligence-refresh";

const CRM_REFRESH_STATE_PREFIX = "crm_refresh:state";
const CRM_REFRESH_LOCK_PREFIX = "crm_refresh:lock";
const CRM_REFRESH_STATE_TTL_SECONDS = 60 * 60 * 24;
const CRM_REFRESH_LOCK_TTL_MS = 120_000;
const CRM_REFRESH_LOCK_REFRESH_INTERVAL_MS = 30_000;
const CRM_REFRESH_WAIT_TIMEOUT_MS = 15_000;
const CRM_REFRESH_POLL_MS = 50;
const CRM_REFRESH_RETRY_DELAY_MS = 1_000;
const CRM_REFRESH_STALE_GRACE_MS = CRM_REFRESH_LOCK_TTL_MS + 5_000;
const CRM_REFRESH_WORKER_CONCURRENCY = 4;

const defaultJobOptions: JobsOptions = buildQueueJobOptions({
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 500,
  },
});

const sharedRedis = new Proxy({} as ReturnType<typeof getSharedRedisConnection>, {
  get(_target, property) {
    const client = getSharedRedisConnection();
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

const globalForCRMRefresh = globalThis as typeof globalThis & {
  __sylphCRMRefreshQueue?: Queue<CRMRefreshWakeJob>;
  __sylphCRMRefreshWorker?: Worker<CRMRefreshWakeJob>;
};

const SCHEDULE_REFRESH_SCRIPT = `
local version = redis.call("HINCRBY", KEYS[1], "requestedVersion", 1)
redis.call("HSET", KEYS[1], "latestRequest", ARGV[1], "updatedAt", ARGV[2], "lastError", "")
redis.call("EXPIRE", KEYS[1], tonumber(ARGV[3]))
return version
`;

type CRMRefreshStoredState = {
  requestedVersion: number;
  processingVersion: number;
  completedVersion: number;
  latestRequest: CRMRefreshRequestPayload | null;
  lastError: string | null;
  updatedAt: string | null;
};

export type CRMRefreshSignalContext = {
  clientAiTone?: string | null;
  salesSignals?: {
    intent?: string | null;
    intentCategory?: string | null;
    emotion?: string | null;
    userSignal?: string | null;
    temperature?: string | null;
    stage?: string | null;
    objection?: string | null;
    qualificationMissing?: string[];
    unansweredQuestionCount?: number;
    planKey?: string | null;
  };
};

export type CRMRefreshRequestPayload = {
  businessId: string;
  leadId: string;
  inputMessage?: string | null;
  traceId?: string | null;
  source?: string;
  route?: string | null;
  followupAction?: string | null;
  decisionAction?: string | null;
  signalContext?: CRMRefreshSignalContext | null;
};

export type CRMRefreshWakeJob = {
  key: string;
  version: number;
};

export type CRMRefreshLoopState = CRMRefreshStoredState;

export type CRMRefreshLoopAdapter = {
  readState: (key: string) => Promise<CRMRefreshLoopState>;
  markProcessing: (key: string, version: number) => Promise<void>;
  markCompleted: (key: string, version: number) => Promise<void>;
  markFailed: (key: string, version: number, error: string) => Promise<void>;
  processRequest: (
    request: CRMRefreshRequestPayload,
    version: number
  ) => Promise<void>;
};

export type CRMRefreshLoopResult = {
  processedVersions: number[];
  finalCompletedVersion: number;
};

type DebouncedRefreshQueueOptions<TInput, TOutput> = {
  keyOf: (input: TInput) => string;
  merge: (current: TInput, next: TInput) => TInput;
  execute: (input: TInput) => Promise<TOutput>;
  debounceMs?: number;
  ttlMs?: number;
};

type DebouncedRefreshQueueRequestOptions = {
  force?: boolean;
};

type DebouncedRefreshQueueEntry<TInput, TOutput> = {
  pendingInput: TInput | null;
  pendingWaiters: Array<{
    resolve: (value: TOutput) => void;
    reject: (error: unknown) => void;
  }>;
  runningPromise: Promise<void> | null;
  timer: ReturnType<typeof setTimeout> | null;
  cached:
    | {
        value: TOutput;
        expiresAt: number;
      }
    | null;
};

export const createDebouncedRefreshQueue = <TInput, TOutput>({
  keyOf,
  merge,
  execute,
  debounceMs = 0,
  ttlMs = 0,
}: DebouncedRefreshQueueOptions<TInput, TOutput>) => {
  const entries = new Map<string, DebouncedRefreshQueueEntry<TInput, TOutput>>();

  const getOrCreateEntry = (key: string) => {
    let entry = entries.get(key);

    if (!entry) {
      entry = {
        pendingInput: null,
        pendingWaiters: [],
        runningPromise: null,
        timer: null,
        cached: null,
      };
      entries.set(key, entry);
    }

    return entry;
  };

  const clearEntryIfIdle = (key: string, entry: DebouncedRefreshQueueEntry<TInput, TOutput>) => {
    const cacheValid =
      !!entry.cached && (ttlMs <= 0 || entry.cached.expiresAt > Date.now());

    if (
      !entry.pendingInput &&
      !entry.pendingWaiters.length &&
      !entry.runningPromise &&
      !entry.timer &&
      !cacheValid
    ) {
      entries.delete(key);
    }
  };

  const runEntry = async (key: string, entry: DebouncedRefreshQueueEntry<TInput, TOutput>) => {
    if (!entry.pendingInput || entry.runningPromise) {
      return;
    }

    const input = entry.pendingInput;
    const waiters = [...entry.pendingWaiters];
    entry.pendingInput = null;
    entry.pendingWaiters = [];

    entry.runningPromise = (async () => {
      try {
        const value = await execute(input);

        entry.cached =
          ttlMs > 0
            ? {
                value,
                expiresAt: Date.now() + ttlMs,
              }
            : null;

        waiters.forEach((waiter) => waiter.resolve(value));
      } catch (error) {
        waiters.forEach((waiter) => waiter.reject(error));
      } finally {
        entry.runningPromise = null;

        if (entry.pendingInput) {
          if (!entry.timer) {
            entry.timer = setTimeout(() => {
              entry.timer = null;
              void runEntry(key, entry);
            }, Math.max(0, debounceMs));
          }
        } else {
          clearEntryIfIdle(key, entry);
        }
      }
    })();

    await entry.runningPromise;
  };

  const scheduleRun = (key: string, entry: DebouncedRefreshQueueEntry<TInput, TOutput>) => {
    if (entry.runningPromise || entry.timer || !entry.pendingInput) {
      return;
    }

    entry.timer = setTimeout(() => {
      entry.timer = null;
      void runEntry(key, entry);
    }, Math.max(0, debounceMs));
  };

  return {
    request: async (
      input: TInput,
      options: DebouncedRefreshQueueRequestOptions = {}
    ) => {
      const key = keyOf(input);
      const entry = getOrCreateEntry(key);

      if (
        !options.force &&
        entry.cached &&
        (ttlMs <= 0 || entry.cached.expiresAt > Date.now())
      ) {
        return entry.cached.value;
      }

      entry.pendingInput = entry.pendingInput
        ? merge(entry.pendingInput, input)
        : input;

      return await new Promise<TOutput>((resolve, reject) => {
        entry.pendingWaiters.push({ resolve, reject });
        scheduleRun(key, entry);
      });
    },
    reset: () => {
      for (const entry of entries.values()) {
        if (entry.timer) {
          clearTimeout(entry.timer);
        }

        entry.pendingInput = null;
        entry.pendingWaiters = [];
        entry.runningPromise = null;
        entry.timer = null;
        entry.cached = null;
      }

      entries.clear();
    },
  };
};

const shouldRunWorker =
  process.env.RUN_WORKER === "true" ||
  process.env.RUN_WORKER === undefined;

const toNumber = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toRequestPayload = (value: unknown): CRMRefreshRequestPayload | null => {
  if (!value || typeof value !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as CRMRefreshRequestPayload;

    return {
      businessId: String(parsed.businessId || "").trim(),
      leadId: String(parsed.leadId || "").trim(),
      inputMessage:
        typeof parsed.inputMessage === "string" ? parsed.inputMessage : null,
      traceId: typeof parsed.traceId === "string" ? parsed.traceId : null,
      source: typeof parsed.source === "string" ? parsed.source : undefined,
      route: typeof parsed.route === "string" ? parsed.route : null,
      followupAction:
        typeof parsed.followupAction === "string" ? parsed.followupAction : null,
      decisionAction:
        typeof parsed.decisionAction === "string" ? parsed.decisionAction : null,
      signalContext:
        parsed.signalContext && typeof parsed.signalContext === "object"
          ? {
              clientAiTone:
                typeof parsed.signalContext.clientAiTone === "string"
                  ? parsed.signalContext.clientAiTone
                  : null,
              salesSignals:
                parsed.signalContext.salesSignals &&
                typeof parsed.signalContext.salesSignals === "object"
                  ? {
                      intent:
                        typeof parsed.signalContext.salesSignals.intent === "string"
                          ? parsed.signalContext.salesSignals.intent
                          : null,
                      intentCategory:
                        typeof parsed.signalContext.salesSignals.intentCategory ===
                        "string"
                          ? parsed.signalContext.salesSignals.intentCategory
                          : null,
                      emotion:
                        typeof parsed.signalContext.salesSignals.emotion === "string"
                          ? parsed.signalContext.salesSignals.emotion
                          : null,
                      userSignal:
                        typeof parsed.signalContext.salesSignals.userSignal ===
                        "string"
                          ? parsed.signalContext.salesSignals.userSignal
                          : null,
                      temperature:
                        typeof parsed.signalContext.salesSignals.temperature ===
                        "string"
                          ? parsed.signalContext.salesSignals.temperature
                          : null,
                      stage:
                        typeof parsed.signalContext.salesSignals.stage === "string"
                          ? parsed.signalContext.salesSignals.stage
                          : null,
                      objection:
                        typeof parsed.signalContext.salesSignals.objection ===
                        "string"
                          ? parsed.signalContext.salesSignals.objection
                          : null,
                      qualificationMissing: Array.isArray(
                        parsed.signalContext.salesSignals.qualificationMissing
                      )
                        ? parsed.signalContext.salesSignals.qualificationMissing.map(
                            (item) => String(item || "")
                          )
                        : [],
                      unansweredQuestionCount: toNumber(
                        parsed.signalContext.salesSignals.unansweredQuestionCount
                      ),
                      planKey:
                        typeof parsed.signalContext.salesSignals.planKey === "string"
                          ? parsed.signalContext.salesSignals.planKey
                          : null,
                    }
                  : undefined,
            }
          : null,
    };
  } catch {
    return null;
  }
};

const buildStateKey = (key: string) => `${CRM_REFRESH_STATE_PREFIX}:${key}`;
const buildLockKey = (key: string) => `${CRM_REFRESH_LOCK_PREFIX}:${key}`;
const buildJobId = (key: string, version: number) =>
  `crm-refresh:${key}:${version}`;
const buildRetryJobId = (key: string, version: number) =>
  `crm-refresh-retry:${key}:${version}`;

const hydrateCRMRefreshState = (
  raw: Record<string, unknown>
): CRMRefreshStoredState => ({
  requestedVersion: toNumber(raw.requestedVersion),
  processingVersion: toNumber(raw.processingVersion),
  completedVersion: toNumber(raw.completedVersion),
  latestRequest: toRequestPayload(raw.latestRequest),
  lastError: raw.lastError ? String(raw.lastError) : null,
  updatedAt: raw.updatedAt ? String(raw.updatedAt) : null,
});

export const getCRMRefreshQueueKey = (businessId: string, leadId: string) =>
  `${businessId}:${leadId}`;

export const initCRMRefreshQueue = () => {
  if (!globalForCRMRefresh.__sylphCRMRefreshQueue) {
    globalForCRMRefresh.__sylphCRMRefreshQueue = new Queue<CRMRefreshWakeJob>(
      CRM_REFRESH_QUEUE_NAME,
      {
        connection: getQueueRedisConnection(),
        prefix: env.AI_QUEUE_PREFIX,
        defaultJobOptions,
        streams: {
          events: {
            maxLen: 1000,
          },
        },
      }
    );
  }

  return globalForCRMRefresh.__sylphCRMRefreshQueue;
};

const getCRMRefreshQueue = () => initCRMRefreshQueue();

export const cleanupStaleCRMRefreshState = async (
  key: string
): Promise<CRMRefreshStoredState> => {
  const raw = await sharedRedis.hgetall(buildStateKey(key));
  const state = hydrateCRMRefreshState(raw);

  if (state.processingVersion <= state.completedVersion) {
    return state;
  }

  const lockToken = await sharedRedis.get(buildLockKey(key));

  if (lockToken) {
    return state;
  }

  const updatedAtMs = state.updatedAt ? Date.parse(state.updatedAt) : NaN;

  if (
    Number.isFinite(updatedAtMs) &&
    Date.now() - updatedAtMs < CRM_REFRESH_STALE_GRACE_MS
  ) {
    return state;
  }

  await sharedRedis.hset(buildStateKey(key), {
    processingVersion: String(state.completedVersion),
    lastError: state.lastError || "crm_refresh_stale_lock_recovered",
    updatedAt: new Date().toISOString(),
  });
  await sharedRedis.expire(buildStateKey(key), CRM_REFRESH_STATE_TTL_SECONDS);

  return {
    ...state,
    processingVersion: state.completedVersion,
    lastError: state.lastError || "crm_refresh_stale_lock_recovered",
    updatedAt: new Date().toISOString(),
  };
};

export const readCRMRefreshState = async (
  key: string
): Promise<CRMRefreshStoredState> => {
  const cleaned = await cleanupStaleCRMRefreshState(key);
  const raw = await sharedRedis.hgetall(buildStateKey(key));

  if (!Object.keys(raw).length) {
    return cleaned;
  }

  return hydrateCRMRefreshState(raw);
};

const markCRMRefreshProcessing = async (key: string, version: number) => {
  await sharedRedis.hset(buildStateKey(key), {
    processingVersion: String(version),
    updatedAt: new Date().toISOString(),
  });
  await sharedRedis.expire(buildStateKey(key), CRM_REFRESH_STATE_TTL_SECONDS);
};

const markCRMRefreshCompleted = async (key: string, version: number) => {
  const state = await readCRMRefreshState(key);

  if (state.completedVersion >= version) {
    return;
  }

  await sharedRedis.hset(buildStateKey(key), {
    completedVersion: String(version),
    processingVersion: String(version),
    lastError: "",
    updatedAt: new Date().toISOString(),
  });
  await sharedRedis.expire(buildStateKey(key), CRM_REFRESH_STATE_TTL_SECONDS);
};

const markCRMRefreshFailed = async (
  key: string,
  version: number,
  error: string
) => {
  await sharedRedis.hset(buildStateKey(key), {
    processingVersion: String(version),
    lastError: error,
    updatedAt: new Date().toISOString(),
  });
  await sharedRedis.expire(buildStateKey(key), CRM_REFRESH_STATE_TTL_SECONDS);
};

const scheduleCRMRefreshWake = async ({
  key,
  version,
  delayMs = 0,
  retry = false,
}: {
  key: string;
  version: number;
  delayMs?: number;
  retry?: boolean;
}) => {
  try {
    await getCRMRefreshQueue().add(
      retry ? "refresh-retry" : "refresh",
      {
        key,
        version,
      },
      {
        ...defaultJobOptions,
        delay: Math.max(0, delayMs),
        jobId: retry ? buildRetryJobId(key, version) : buildJobId(key, version),
      }
    );
  } catch (error) {
    const message = String((error as { message?: unknown })?.message || error || "");

    if (/job.+already exists/i.test(message)) {
      return;
    }

    throw error;
  }
};

export const enqueueCRMRefreshRequest = async (
  request: CRMRefreshRequestPayload
) => {
  await enforceSecurityGovernanceInfluence({
    domain: "CRM",
    action: "messages:enqueue",
    businessId: request.businessId,
    tenantId: request.businessId,
    actorId: "crm_refresh_runtime",
    actorType: "SERVICE",
    role: "SERVICE",
    permissions: ["messages:enqueue"],
    scopes: ["WRITE"],
    resourceType: "CRM_REFRESH",
    resourceId: request.leadId,
    resourceTenantId: request.businessId,
    purpose: "CRM_REFRESH",
    metadata: {
      source: request.source || "UNKNOWN",
      route: request.route || null,
    },
  });

  const key = getCRMRefreshQueueKey(request.businessId, request.leadId);
  const now = new Date().toISOString();
  const version = Number(
    await sharedRedis.eval(
      SCHEDULE_REFRESH_SCRIPT,
      1,
      buildStateKey(key),
      JSON.stringify(request),
      now,
      String(CRM_REFRESH_STATE_TTL_SECONDS)
    )
  );

  await scheduleCRMRefreshWake({
    key,
    version,
  });

  return {
    key,
    version,
  };
};

const scheduleCRMRefreshRetry = async (key: string) => {
  const state = await readCRMRefreshState(key);

  if (state.requestedVersion <= state.completedVersion) {
    return;
  }

  const lockTtlMs = await sharedRedis.pttl(buildLockKey(key));
  const delayMs =
    lockTtlMs > 0
      ? Math.max(CRM_REFRESH_RETRY_DELAY_MS, lockTtlMs + CRM_REFRESH_POLL_MS)
      : CRM_REFRESH_RETRY_DELAY_MS;

  await scheduleCRMRefreshWake({
    key,
    version: state.requestedVersion,
    delayMs,
    retry: true,
  });
};

export const waitForCRMRefreshVersion = async ({
  key,
  version,
  timeoutMs = CRM_REFRESH_WAIT_TIMEOUT_MS,
  pollMs = CRM_REFRESH_POLL_MS,
}: {
  key: string;
  version: number;
  timeoutMs?: number;
  pollMs?: number;
}) => {
  const deadline = Date.now() + Math.max(100, timeoutMs);
  const effectivePollMs = Math.max(20, pollMs);

  do {
    const state = await readCRMRefreshState(key);

    if (state.completedVersion >= version) {
      return state;
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `CRM refresh wait timed out for ${key} at version ${version}`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, effectivePollMs));
  } while (Date.now() <= deadline);

  throw new Error(`CRM refresh wait exhausted for ${key} at version ${version}`);
};

export const runDirtyRefreshLoop = async ({
  key,
  adapter,
}: {
  key: string;
  adapter: CRMRefreshLoopAdapter;
}): Promise<CRMRefreshLoopResult> => {
  const processedVersions: number[] = [];

  while (true) {
    const state = await adapter.readState(key);

    if (state.requestedVersion <= state.completedVersion) {
      return {
        processedVersions,
        finalCompletedVersion: state.completedVersion,
      };
    }

    if (!state.latestRequest) {
      throw new Error(`CRM refresh request payload missing for ${key}`);
    }

    const targetVersion = state.requestedVersion;
    await adapter.markProcessing(key, targetVersion);

    try {
      await adapter.processRequest(state.latestRequest, targetVersion);
    } catch (error) {
      const message = String(
        (error as { message?: unknown })?.message || error || "crm_refresh_failed"
      );
      await adapter.markFailed(key, targetVersion, message);
      throw error;
    }

    await adapter.markCompleted(key, targetVersion);
    processedVersions.push(targetVersion);
  }
};

export const startCRMRefreshWorker = ({
  processor,
  concurrency = CRM_REFRESH_WORKER_CONCURRENCY,
}: {
  processor: (
    request: CRMRefreshRequestPayload,
    version: number
  ) => Promise<void>;
  concurrency?: number;
}) => {
  if (!shouldRunWorker) {
    return null;
  }

  if (globalForCRMRefresh.__sylphCRMRefreshWorker) {
    return globalForCRMRefresh.__sylphCRMRefreshWorker;
  }

  const worker = new Worker<CRMRefreshWakeJob>(
    CRM_REFRESH_QUEUE_NAME,
    withRedisWorkerFailSafe(CRM_REFRESH_QUEUE_NAME, async (job: Job<CRMRefreshWakeJob>) => {
      const { key } = job.data;
      const lock = await acquireDistributedLock({
        key: buildLockKey(key),
        ttlMs: CRM_REFRESH_LOCK_TTL_MS,
        token: `${process.pid}:${String(job.id || job.name)}`,
        refreshIntervalMs: CRM_REFRESH_LOCK_REFRESH_INTERVAL_MS,
      });

      if (!lock) {
        const state = await readCRMRefreshState(key);

        if (state.requestedVersion > state.completedVersion) {
          await scheduleCRMRefreshRetry(key);

          logger.debug(
            {
              key,
              jobId: job.id || null,
              requestedVersion: state.requestedVersion,
              completedVersion: state.completedVersion,
              lockTtlMs: await sharedRedis.pttl(buildLockKey(key)),
            },
            "CRM refresh worker skipped because another worker holds the lead lock"
          );
        }

        return;
      }

      try {
        return await runDirtyRefreshLoop({
          key,
          adapter: {
            readState: readCRMRefreshState,
            markProcessing: markCRMRefreshProcessing,
            markCompleted: markCRMRefreshCompleted,
            markFailed: markCRMRefreshFailed,
            processRequest: processor,
          },
        });
      } finally {
        await lock.release().catch(() => undefined);
      }
    }),
    {
      connection: getWorkerRedisConnection(),
      concurrency: Math.max(1, concurrency),
    }
  );

  worker.on("failed", (job, error) => {
    logger.error(
      {
        queueName: CRM_REFRESH_QUEUE_NAME,
        jobId: job?.id || null,
        key: job?.data?.key || null,
        version: job?.data?.version || null,
        error,
      },
      "CRM refresh worker job failed"
    );
  });

  globalForCRMRefresh.__sylphCRMRefreshWorker = worker;
  return worker;
};

export const initCRMRefreshWorker = startCRMRefreshWorker;

export const closeCRMRefreshQueue = async () => {
  await globalForCRMRefresh.__sylphCRMRefreshWorker?.close().catch(() => undefined);
  await globalForCRMRefresh.__sylphCRMRefreshQueue?.close().catch(() => undefined);
  globalForCRMRefresh.__sylphCRMRefreshWorker = undefined;
  globalForCRMRefresh.__sylphCRMRefreshQueue = undefined;
};
