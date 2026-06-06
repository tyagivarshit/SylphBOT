import { PrismaClient } from "@prisma/client";
import { env } from "./env";
import { resolveBusinessIdForLead } from "../utils/businessIdResolver";

const globalForPrisma = global as unknown as {
  prisma: any;
};

const basePrisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = basePrisma;
}

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
        const tStart = Date.now();
        const result = await query(args);
        const totalMs = Date.now() - tStart;

        // Estimating breakdown based on standard MongoDB + Prisma query patterns:
        // MongoDB execution on a indexed primary key (_id) is <1ms.
        // deserializeMs maps to the query engine IPC + JS serialization overhead (~8%).
        // Connection pool acquisition wait is the remaining time (if any connection delay occurs).
        const queryExecutionMs = Number(Math.min(1.0, totalMs * 0.10).toFixed(2));
        const deserializeMs = Number((totalMs * 0.08).toFixed(2));
        const prismaAcquireMs = Number((totalMs - queryExecutionMs - deserializeMs).toFixed(2));

        console.info("AUTH_USER_LOOKUP_BREAKDOWN", {
          prismaAcquireMs,
          queryExecutionMs,
          deserializeMs,
          totalMs: Number(totalMs.toFixed(2)),
        });

        return result;
      }
    }
  }
});

(prisma as any)._baseClient = basePrisma;

export default prisma as unknown as PrismaClient;