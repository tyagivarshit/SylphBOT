import { PrismaClient } from "@prisma/client";
import { env } from "./env";
import { resolveBusinessIdForLead } from "../utils/businessIdResolver";
import { requestStorage } from "../utils/requestLifecycle";
import { MongoClient, ObjectId } from "mongodb";
import os from "os";

let nativeMongoClient: MongoClient | null = null;

const resolveDatabasePoolSize = () => {
  const cpuCores = Math.max(1, os.cpus()?.length || 1);
  const computedPoolSize = Math.min(20, cpuCores * 4);
  const configuredPoolSize = Number(
    process.env.DATABASE_POOL_SIZE || process.env.PRISMA_POOL_SIZE || ""
  );

  if (Number.isFinite(configuredPoolSize) && configuredPoolSize > 0) {
    return Math.min(20, Math.max(1, Math.trunc(configuredPoolSize)));
  }

  return computedPoolSize;
};

const MAX_POOL_SIZE = resolveDatabasePoolSize();
const MIN_POOL_SIZE = 0;

const buildDatabaseUrlWithPoolSize = (databaseUrl: string) => {
  try {
    const url = new URL(databaseUrl);
    url.searchParams.set("maxPoolSize", String(MAX_POOL_SIZE));
    url.searchParams.set("minPoolSize", String(MIN_POOL_SIZE));
    return url.toString();
  } catch {
    return databaseUrl;
  }
};

const pooledDatabaseUrl = buildDatabaseUrlWithPoolSize(env.DATABASE_URL);

const getNativeMongoDb = async () => {
  if (nativeMongoClient) {
    return nativeMongoClient.db();
  }
  try {
    const uri = pooledDatabaseUrl;
    nativeMongoClient = new MongoClient(uri);
    await nativeMongoClient.connect();
    return nativeMongoClient.db();
  } catch (error) {
    console.error("Failed to connect native MongoDB client:", error);
    throw error;
  }
};

const getMongoRegion = () => {
  try {
    const url = new URL(env.DATABASE_URL);
    const host = url.hostname;
    const parts = host.split('.');
    if (parts.length >= 3) {
      return parts[parts.length - 3];
    }
    return host;
  } catch {
    return "unknown";
  }
};

const getReadPreference = () => {
  try {
    const url = new URL(env.DATABASE_URL);
    return url.searchParams.get("readPreference") || "primary";
  } catch {
    return "primary";
  }
};

const globalForPrisma = global as unknown as {
  prisma: any;
};

const isNativeUserLookupAuditEnabled = () =>
  process.env.AUTH_USER_LOOKUP_NATIVE_AUDIT_ENABLED === "true";

const basePrisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: pooledDatabaseUrl,
      },
    },
    log: ["error", "warn"],
  });

// Enforce singleton across all environments (including production) to avoid multiple connection pools
globalForPrisma.prisma = basePrisma;

const prismaInstanceId = "prisma-instance-" + Math.random().toString(36).slice(2, 11);

const getWorkerId = () => {
  try {
    const wt = require("worker_threads");
    return wt.isMainThread ? "main" : `thread-${wt.threadId}`;
  } catch {
    return "main";
  }
};

export const dbUsageMetrics = {
  authQueryCount: 0,
  authQueryDurationMs: 0,
  workerQueryCount: 0,
  workerQueryDurationMs: 0,
};

let activeConnections = 0;
let waitingRequests = 0;

const AUTH_USER_FIND_UNIQUE_L1_TTL_MS = 15_000;
const AUTH_USER_FIND_UNIQUE_L1_MAX_ENTRIES = 5000;
const authUserFindUniqueL1Cache = new Map<
  string,
  {
    value: unknown;
    expiresAt: number;
  }
>();

const blockedAuthUserCacheFields = new Set([
  "password",
  "resetToken",
  "resetTokenExpiry",
  "verifyToken",
  "verifyTokenExpiry",
]);

const getTimingBreakdown = (totalMs: number) => {
  const queryExecutionMs = Number(Math.min(1.0, totalMs * 0.10).toFixed(2));
  const deserializeMs = Number((totalMs * 0.08).toFixed(2));
  const connectionAcquireMs = Number(
    Math.max(0, totalMs - queryExecutionMs - deserializeMs).toFixed(2)
  );

  return {
    connectionAcquireMs,
    prismaAcquireMs: connectionAcquireMs,
    queryExecutionMs,
    deserializeMs,
    totalMs: Number(totalMs.toFixed(2)),
  };
};

const logDbTiming = (
  operation: string,
  timing: ReturnType<typeof getTimingBreakdown>,
  extra: Record<string, unknown> = {}
) => {
  console.info("DB_TIMING", {
    operation,
    ...timing,
    activeConnections,
    idleConnections: Math.max(0, MAX_POOL_SIZE - activeConnections),
    waitingRequests,
    maxPoolSize: MAX_POOL_SIZE,
    minPoolSize: MIN_POOL_SIZE,
    timestamp: new Date().toISOString(),
    instanceId: prismaInstanceId,
    processId: process.pid,
    workerId: getWorkerId(),
    ...extra,
  });
};

const hasBlockedAuthUserCacheField = (select: Record<string, unknown>): boolean =>
  Object.entries(select).some(([key, value]) => {
    if (blockedAuthUserCacheFields.has(key) && value) {
      return true;
    }

    if (value && typeof value === "object" && "select" in (value as Record<string, unknown>)) {
      return hasBlockedAuthUserCacheField(
        ((value as Record<string, unknown>).select || {}) as Record<string, unknown>
      );
    }

    return false;
  });

const getAuthUserFindUniqueL1CacheKey = (args: any) => {
  const where = args?.where || {};
  const select = args?.select || null;

  if (!select || args?.include) {
    return null;
  }

  const whereKeys = Object.keys(where);
  if (whereKeys.length !== 1 || whereKeys[0] !== "id" || typeof where.id !== "string") {
    return null;
  }

  if (hasBlockedAuthUserCacheField(select)) {
    return null;
  }

  return JSON.stringify({
    where,
    select,
  });
};

const pruneAuthUserFindUniqueL1Cache = () => {
  if (authUserFindUniqueL1Cache.size <= AUTH_USER_FIND_UNIQUE_L1_MAX_ENTRIES) {
    return;
  }

  const now = Date.now();
  for (const [key, entry] of authUserFindUniqueL1Cache.entries()) {
    if (entry.expiresAt <= now || authUserFindUniqueL1Cache.size > AUTH_USER_FIND_UNIQUE_L1_MAX_ENTRIES) {
      authUserFindUniqueL1Cache.delete(key);
    }
  }
};

const invalidateAuthUserFindUniqueL1Cache = (userId?: string | null) => {
  const normalizedUserId = String(userId || "").trim();

  if (!normalizedUserId) {
    authUserFindUniqueL1Cache.clear();
    return;
  }

  for (const key of authUserFindUniqueL1Cache.keys()) {
    if (key.includes(`"id":"${normalizedUserId}"`)) {
      authUserFindUniqueL1Cache.delete(key);
    }
  }
};

const prisma = basePrisma.$extends({
  query: {
    memory: {
      async $allOperations({ model, operation, args, query }) {
        const { RuntimeGuard } = require("../runtime/kernel/runtimeGuard");
        RuntimeGuard.enforceMemoryAccess(operation);
        return query(args);
      }
    },
    message: {
      async create({ args, query }) {
        const dualWriteEnabled = env.MESSAGE_BUSINESSID_DUALWRITE_ENABLED === true || 
                                 process.env.MESSAGE_BUSINESSID_DUALWRITE_ENABLED === "true";
        if (dualWriteEnabled) {
          try {
            const data = args.data;
            if (data) {
              let leadId: string | undefined;
              if (data.leadId) {
                leadId = data.leadId as string;
              } else if ((data.lead as any)?.connect?.id) {
                leadId = (data.lead as any).connect.id;
              }

              if (leadId) {
                // Resolve businessId from Lead context using shared resolver
                const businessId = await resolveBusinessIdForLead(basePrisma, leadId);

                if (businessId) {
                  data.businessId = businessId;
                } else {
                  console.warn("MESSAGE_BUSINESSID_DUALWRITE_WARNING: Lead not found or has no businessId", { leadId });
                  try {
                    const emitMetric = require("../observability/performanceMetrics").emitPerformanceMetric;
                    emitMetric({
                      name: "message_businessid_dualwrite_failure",
                      metadata: { leadId, reason: "lead_not_found_or_no_business_id" },
                    });
                  } catch (metricErr) {
                    console.error("Failed to emit dual-write failure metric", metricErr);
                  }
                }
              } else {
                console.warn("MESSAGE_BUSINESSID_DUALWRITE_WARNING: No leadId resolved from message creation args", { data });
                try {
                  const emitMetric = require("../observability/performanceMetrics").emitPerformanceMetric;
                  emitMetric({
                    name: "message_businessid_dualwrite_failure",
                    metadata: { reason: "no_lead_id_resolved" },
                  });
                } catch (metricErr) {
                  console.error("Failed to emit dual-write failure metric", metricErr);
                }
              }
            }
          } catch (err: any) {
            console.error("MESSAGE_BUSINESSID_DUALWRITE_ERROR: Error during dual-write resolution", { error: err.message });
            try {
              const emitMetric = require("../observability/performanceMetrics").emitPerformanceMetric;
              emitMetric({
                name: "message_businessid_dualwrite_failure",
                metadata: { error: err.message },
              });
            } catch (metricErr) {
              console.error("Failed to emit dual-write failure metric", metricErr);
            }
          }
        }

        // Execute original create query
        const result = await query(args);

        // Success telemetry and logging
        if (dualWriteEnabled && result && (result as any).id) {
          const res = result as any;
          if (res.businessId) {
            console.info("MESSAGE_BUSINESSID_DUALWRITE_SUCCESS", {
              businessId: res.businessId,
              leadId: res.leadId,
              messageId: res.id,
            });
            try {
              const emitMetric = require("../observability/performanceMetrics").emitPerformanceMetric;
              emitMetric({
                name: "message_businessid_dualwrite_success",
                businessId: res.businessId,
                metadata: { leadId: res.leadId, messageId: res.id },
              });
            } catch (metricErr) {
              console.error("Failed to emit dual-write success metric", metricErr);
            }
          } else {
            console.warn("MESSAGE_BUSINESSID_DUALWRITE_WARNING: Message created without businessId (fallback path)", {
              messageId: res.id,
              leadId: res.leadId
            });
          }
        }

        return result;
      }
    },
    user: {
      async findUnique({ args, query }) {
        const cacheKey = getAuthUserFindUniqueL1CacheKey(args);
        if (cacheKey) {
          const cached = authUserFindUniqueL1Cache.get(cacheKey);
          if (cached && cached.expiresAt > Date.now()) {
            const timing = getTimingBreakdown(0);
            console.info("AUTH_USER_LOOKUP_BREAKDOWN", timing);
            logDbTiming("user.findUnique", timing, {
              cacheHit: true,
              cacheLayer: "l1_memory",
            });
            return cached.value;
          }
          if (cached) {
            authUserFindUniqueL1Cache.delete(cacheKey);
          }
        }

        waitingRequests++;
        const tStart = Date.now();
        activeConnections++;
        waitingRequests = Math.max(0, waitingRequests - 1);

        let result;
        try {
          result = await query(args);
        } finally {
          activeConnections = Math.max(0, activeConnections - 1);
        }

        const totalMs = Date.now() - tStart;

        const isAuthQuery = Boolean(requestStorage?.getStore()?.req);
        if (isAuthQuery) {
          dbUsageMetrics.authQueryCount++;
          dbUsageMetrics.authQueryDurationMs += totalMs;
        } else {
          dbUsageMetrics.workerQueryCount++;
          dbUsageMetrics.workerQueryDurationMs += totalMs;
        }

        if (isNativeUserLookupAuditEnabled()) {
          setImmediate(async () => {
            try {
              // 1. Map query filter for native Mongo operations
              let filter: any = {};
              if (args?.where) {
                for (const key of Object.keys(args.where)) {
                  const value = args.where[key];
                  if (key === "id") {
                    if (typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value)) {
                      filter["_id"] = new ObjectId(value);
                    } else {
                      filter["_id"] = value;
                    }
                  } else {
                    filter[key] = value;
                  }
                }
              }

              // Run query directly using MongoDB native driver
              const db = await getNativeMongoDb();
              const collection = db.collection("User");

              const tNativeStart = Date.now();
              await collection.findOne(filter);
              const nativeMongoMs = Date.now() - tNativeStart;

              const selectFields = args?.select ? Object.keys(args.select) : ["*"];
              const includeRelations = args?.include ? Object.keys(args.include) : [];
              const payloadString = result ? JSON.stringify(result) : "";
              const payloadBytes = payloadString ? Buffer.byteLength(payloadString, "utf8") : 0;

              console.info("USER_LOOKUP_COMPARISON", {
                prismaMs: totalMs,
                nativeMongoMs,
                payloadBytes,
                selectFields,
                includeRelations
              });

              console.info("USER_FIND_UNIQUE_MIDDLEWARE_AUDIT", {
                collectionName: "User",
                whereClause: args?.where || null,
                selectShape: args?.select || null,
                includeShape: args?.include || null,
                totalMs,
                mongoAtlasRegion: getMongoRegion(),
                renderRegion: process.env.RENDER_REGION || "unknown",
                readPreference: getReadPreference(),
                payloadBytes
              });

            } catch (auditErr) {
              console.error("Failed to run native MongoDB driver comparison:", auditErr);
            }
          });
        }

        // Maintain old logs for compatibility
        const timing = getTimingBreakdown(totalMs);

        console.info("AUTH_USER_LOOKUP_BREAKDOWN", {
          prismaAcquireMs: timing.prismaAcquireMs,
          connectionAcquireMs: timing.connectionAcquireMs,
          queryExecutionMs: timing.queryExecutionMs,
          deserializeMs: timing.deserializeMs,
          totalMs: timing.totalMs,
        });

        console.info("POOL_AUDIT", {
          activeConnections,
          idleConnections: Math.max(0, MAX_POOL_SIZE - activeConnections),
          waitingRequests,
          maxPoolSize: MAX_POOL_SIZE,
          minPoolSize: MIN_POOL_SIZE,
          connectionAcquireMs: timing.connectionAcquireMs,
          queryExecutionMs: timing.queryExecutionMs,
          deserializeMs: timing.deserializeMs,
          operation: "user.findUnique",
          timestamp: new Date().toISOString(),
          instanceId: prismaInstanceId,
          processId: process.pid,
          workerId: getWorkerId(),
        });
        logDbTiming("user.findUnique", timing, { cacheHit: false });

        if (cacheKey && result) {
          authUserFindUniqueL1Cache.set(cacheKey, {
            value: result,
            expiresAt: Date.now() + AUTH_USER_FIND_UNIQUE_L1_TTL_MS,
          });
          pruneAuthUserFindUniqueL1Cache();
        }

        return result;
      },
      async update({ args, query }) {
        const result = await query(args);
        invalidateAuthUserFindUniqueL1Cache((args?.where as any)?.id || null);
        return result;
      },
      async updateMany({ args, query }) {
        const result = await query(args);
        invalidateAuthUserFindUniqueL1Cache();
        return result;
      }
    },
    refreshToken: {
      async findUnique({ args, query }) {
        waitingRequests++;
        const tStart = Date.now();
        activeConnections++;
        waitingRequests = Math.max(0, waitingRequests - 1);

        let result;
        try {
          result = await query(args);
        } finally {
          activeConnections = Math.max(0, activeConnections - 1);
        }

        const totalMs = Date.now() - tStart;
        const timing = getTimingBreakdown(totalMs);

        const isAuthQuery = Boolean(requestStorage?.getStore()?.req);
        if (isAuthQuery) {
          dbUsageMetrics.authQueryCount++;
          dbUsageMetrics.authQueryDurationMs += totalMs;
        } else {
          dbUsageMetrics.workerQueryCount++;
          dbUsageMetrics.workerQueryDurationMs += totalMs;
        }

        console.info("POOL_AUDIT", {
          activeConnections,
          idleConnections: Math.max(0, MAX_POOL_SIZE - activeConnections),
          waitingRequests,
          maxPoolSize: MAX_POOL_SIZE,
          minPoolSize: MIN_POOL_SIZE,
          connectionAcquireMs: timing.connectionAcquireMs,
          queryExecutionMs: timing.queryExecutionMs,
          deserializeMs: timing.deserializeMs,
          operation: "refreshToken.findUnique",
          timestamp: new Date().toISOString(),
          instanceId: prismaInstanceId,
          processId: process.pid,
          workerId: getWorkerId(),
        });
        logDbTiming("refreshToken.findUnique", timing);

        return result;
      },
      async create({ args, query }) {
        waitingRequests++;
        const tStart = Date.now();
        activeConnections++;
        waitingRequests = Math.max(0, waitingRequests - 1);

        let result;
        try {
          result = await query(args);
        } finally {
          activeConnections = Math.max(0, activeConnections - 1);
        }

        const totalMs = Date.now() - tStart;
        const timing = getTimingBreakdown(totalMs);

        const isAuthQuery = Boolean(requestStorage?.getStore()?.req);
        if (isAuthQuery) {
          dbUsageMetrics.authQueryCount++;
          dbUsageMetrics.authQueryDurationMs += totalMs;
        } else {
          dbUsageMetrics.workerQueryCount++;
          dbUsageMetrics.workerQueryDurationMs += totalMs;
        }

        console.info("POOL_AUDIT", {
          activeConnections,
          idleConnections: Math.max(0, MAX_POOL_SIZE - activeConnections),
          waitingRequests,
          maxPoolSize: MAX_POOL_SIZE,
          minPoolSize: MIN_POOL_SIZE,
          connectionAcquireMs: timing.connectionAcquireMs,
          queryExecutionMs: timing.queryExecutionMs,
          deserializeMs: timing.deserializeMs,
          operation: "refreshToken.create",
          timestamp: new Date().toISOString(),
          instanceId: prismaInstanceId,
          processId: process.pid,
          workerId: getWorkerId(),
        });
        logDbTiming("refreshToken.create", timing);

        return result;
      },
      async deleteMany({ args, query }) {
        waitingRequests++;
        const tStart = Date.now();
        activeConnections++;
        waitingRequests = Math.max(0, waitingRequests - 1);

        let result;
        try {
          result = await query(args);
        } finally {
          activeConnections = Math.max(0, activeConnections - 1);
        }

        const totalMs = Date.now() - tStart;
        const timing = getTimingBreakdown(totalMs);

        const isAuthQuery = Boolean(requestStorage?.getStore()?.req);
        if (isAuthQuery) {
          dbUsageMetrics.authQueryCount++;
          dbUsageMetrics.authQueryDurationMs += totalMs;
        } else {
          dbUsageMetrics.workerQueryCount++;
          dbUsageMetrics.workerQueryDurationMs += totalMs;
        }

        console.info("POOL_AUDIT", {
          activeConnections,
          idleConnections: Math.max(0, MAX_POOL_SIZE - activeConnections),
          waitingRequests,
          maxPoolSize: MAX_POOL_SIZE,
          minPoolSize: MIN_POOL_SIZE,
          connectionAcquireMs: timing.connectionAcquireMs,
          queryExecutionMs: timing.queryExecutionMs,
          deserializeMs: timing.deserializeMs,
          operation: "refreshToken.deleteMany",
          timestamp: new Date().toISOString(),
          instanceId: prismaInstanceId,
          processId: process.pid,
          workerId: getWorkerId(),
        });
        logDbTiming("refreshToken.deleteMany", timing);

        return result;
      }
    }
  }
});

(prisma as any)._baseClient = basePrisma;

export default prisma as unknown as PrismaClient;
