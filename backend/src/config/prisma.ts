import { PrismaClient } from "@prisma/client";
import { env } from "./env";

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
                // Resolve businessId from Lead context using basePrisma
                const lead = await basePrisma.lead.findUnique({
                  where: { id: leadId },
                  select: { businessId: true },
                });

                if (lead?.businessId) {
                  data.businessId = lead.businessId;
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
    }
  }
});

(prisma as any)._baseClient = basePrisma;

export default prisma as unknown as PrismaClient;