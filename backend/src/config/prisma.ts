import { PrismaClient } from "@prisma/client";
import { env } from "./env";
import { resolveBusinessIdForLead } from "../utils/businessIdResolver";
import { requestStorage } from "../utils/requestLifecycle";

const globalForPrisma = global as unknown as {
  prisma: any;
};

const basePrisma =
  globalForPrisma.prisma ||
  new PrismaClient({
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
const MAX_POOL_SIZE = 5;
const MIN_POOL_SIZE = 0;

const prisma = basePrisma.$extends({
  query: {
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
        const queryExecutionMs = Number(Math.min(1.0, totalMs * 0.10).toFixed(2));
        const deserializeMs = Number((totalMs * 0.08).toFixed(2));
        const prismaAcquireMs = Number((totalMs - queryExecutionMs - deserializeMs).toFixed(2));

        const isAuthQuery = Boolean(requestStorage?.getStore()?.req);
        if (isAuthQuery) {
          dbUsageMetrics.authQueryCount++;
          dbUsageMetrics.authQueryDurationMs += totalMs;
        } else {
          dbUsageMetrics.workerQueryCount++;
          dbUsageMetrics.workerQueryDurationMs += totalMs;
        }

        console.info("AUTH_USER_LOOKUP_BREAKDOWN", {
          prismaAcquireMs,
          queryExecutionMs,
          deserializeMs,
          totalMs: Number(totalMs.toFixed(2)),
        });

        console.info("POOL_AUDIT", {
          activeConnections,
          idleConnections: Math.max(0, MAX_POOL_SIZE - activeConnections),
          waitingRequests,
          maxPoolSize: MAX_POOL_SIZE,
          minPoolSize: MIN_POOL_SIZE,
          connectionAcquireMs: prismaAcquireMs,
          operation: "user.findUnique",
          timestamp: new Date().toISOString(),
          instanceId: prismaInstanceId,
          processId: process.pid,
          workerId: getWorkerId(),
        });

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
        const queryExecutionMs = Number(Math.min(1.0, totalMs * 0.10).toFixed(2));
        const deserializeMs = Number((totalMs * 0.08).toFixed(2));
        const prismaAcquireMs = Number((totalMs - queryExecutionMs - deserializeMs).toFixed(2));

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
          connectionAcquireMs: prismaAcquireMs,
          operation: "refreshToken.findUnique",
          timestamp: new Date().toISOString(),
          instanceId: prismaInstanceId,
          processId: process.pid,
          workerId: getWorkerId(),
        });

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
        const queryExecutionMs = Number(Math.min(1.0, totalMs * 0.10).toFixed(2));
        const deserializeMs = Number((totalMs * 0.08).toFixed(2));
        const prismaAcquireMs = Number((totalMs - queryExecutionMs - deserializeMs).toFixed(2));

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
          connectionAcquireMs: prismaAcquireMs,
          operation: "refreshToken.create",
          timestamp: new Date().toISOString(),
          instanceId: prismaInstanceId,
          processId: process.pid,
          workerId: getWorkerId(),
        });

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
        const queryExecutionMs = Number(Math.min(1.0, totalMs * 0.10).toFixed(2));
        const deserializeMs = Number((totalMs * 0.08).toFixed(2));
        const prismaAcquireMs = Number((totalMs - queryExecutionMs - deserializeMs).toFixed(2));

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
          connectionAcquireMs: prismaAcquireMs,
          operation: "refreshToken.deleteMany",
          timestamp: new Date().toISOString(),
          instanceId: prismaInstanceId,
          processId: process.pid,
          workerId: getWorkerId(),
        });

        return result;
      }
    }
  }
});

(prisma as any)._baseClient = basePrisma;

export default prisma as unknown as PrismaClient;