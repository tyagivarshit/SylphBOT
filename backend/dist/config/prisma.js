"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const env_1 = require("./env");
const businessIdResolver_1 = require("../utils/businessIdResolver");
const globalForPrisma = global;
const basePrisma = globalForPrisma.prisma ||
    new client_1.PrismaClient({
        log: ["error", "warn"],
    });
if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = basePrisma;
}
const prisma = basePrisma.$extends({
    query: {
        message: {
            async create({ args, query }) {
                const dualWriteEnabled = env_1.env.MESSAGE_BUSINESSID_DUALWRITE_ENABLED === true ||
                    process.env.MESSAGE_BUSINESSID_DUALWRITE_ENABLED === "true";
                if (dualWriteEnabled) {
                    try {
                        const data = args.data;
                        if (data) {
                            let leadId;
                            if (data.leadId) {
                                leadId = data.leadId;
                            }
                            else if (data.lead?.connect?.id) {
                                leadId = data.lead.connect.id;
                            }
                            if (leadId) {
                                // Resolve businessId from Lead context using shared resolver
                                const businessId = await (0, businessIdResolver_1.resolveBusinessIdForLead)(basePrisma, leadId);
                                if (businessId) {
                                    data.businessId = businessId;
                                }
                                else {
                                    console.warn("MESSAGE_BUSINESSID_DUALWRITE_WARNING: Lead not found or has no businessId", { leadId });
                                    try {
                                        const emitMetric = require("../observability/performanceMetrics").emitPerformanceMetric;
                                        emitMetric({
                                            name: "message_businessid_dualwrite_failure",
                                            metadata: { leadId, reason: "lead_not_found_or_no_business_id" },
                                        });
                                    }
                                    catch (metricErr) {
                                        console.error("Failed to emit dual-write failure metric", metricErr);
                                    }
                                }
                            }
                            else {
                                console.warn("MESSAGE_BUSINESSID_DUALWRITE_WARNING: No leadId resolved from message creation args", { data });
                                try {
                                    const emitMetric = require("../observability/performanceMetrics").emitPerformanceMetric;
                                    emitMetric({
                                        name: "message_businessid_dualwrite_failure",
                                        metadata: { reason: "no_lead_id_resolved" },
                                    });
                                }
                                catch (metricErr) {
                                    console.error("Failed to emit dual-write failure metric", metricErr);
                                }
                            }
                        }
                    }
                    catch (err) {
                        console.error("MESSAGE_BUSINESSID_DUALWRITE_ERROR: Error during dual-write resolution", { error: err.message });
                        try {
                            const emitMetric = require("../observability/performanceMetrics").emitPerformanceMetric;
                            emitMetric({
                                name: "message_businessid_dualwrite_failure",
                                metadata: { error: err.message },
                            });
                        }
                        catch (metricErr) {
                            console.error("Failed to emit dual-write failure metric", metricErr);
                        }
                    }
                }
                // Execute original create query
                const result = await query(args);
                // Success telemetry and logging
                if (dualWriteEnabled && result && result.id) {
                    const res = result;
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
                        }
                        catch (metricErr) {
                            console.error("Failed to emit dual-write success metric", metricErr);
                        }
                    }
                    else {
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
prisma._baseClient = basePrisma;
exports.default = prisma;
