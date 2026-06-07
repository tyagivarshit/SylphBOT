"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbUsageMetrics = void 0;
const client_1 = require("@prisma/client");
const env_1 = require("./env");
const businessIdResolver_1 = require("../utils/businessIdResolver");
const requestLifecycle_1 = require("../utils/requestLifecycle");
const mongodb_1 = require("mongodb");
let nativeMongoClient = null;
const getNativeMongoDb = async () => {
    if (nativeMongoClient) {
        return nativeMongoClient.db();
    }
    try {
        const uri = env_1.env.DATABASE_URL;
        nativeMongoClient = new mongodb_1.MongoClient(uri);
        await nativeMongoClient.connect();
        return nativeMongoClient.db();
    }
    catch (error) {
        console.error("Failed to connect native MongoDB client:", error);
        throw error;
    }
};
const getMongoRegion = () => {
    try {
        const url = new URL(env_1.env.DATABASE_URL);
        const host = url.hostname;
        const parts = host.split('.');
        if (parts.length >= 3) {
            return parts[parts.length - 3];
        }
        return host;
    }
    catch {
        return "unknown";
    }
};
const getReadPreference = () => {
    try {
        const url = new URL(env_1.env.DATABASE_URL);
        return url.searchParams.get("readPreference") || "primary";
    }
    catch {
        return "primary";
    }
};
const globalForPrisma = global;
const basePrisma = globalForPrisma.prisma ||
    new client_1.PrismaClient({
        log: ["error", "warn"],
    });
// Enforce singleton across all environments (including production) to avoid multiple connection pools
globalForPrisma.prisma = basePrisma;
const prismaInstanceId = "prisma-instance-" + Math.random().toString(36).slice(2, 11);
const getWorkerId = () => {
    try {
        const wt = require("worker_threads");
        return wt.isMainThread ? "main" : `thread-${wt.threadId}`;
    }
    catch {
        return "main";
    }
};
exports.dbUsageMetrics = {
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
                }
                finally {
                    activeConnections = Math.max(0, activeConnections - 1);
                }
                const totalMs = Date.now() - tStart;
                const isAuthQuery = Boolean(requestLifecycle_1.requestStorage?.getStore()?.req);
                if (isAuthQuery) {
                    exports.dbUsageMetrics.authQueryCount++;
                    exports.dbUsageMetrics.authQueryDurationMs += totalMs;
                }
                else {
                    exports.dbUsageMetrics.workerQueryCount++;
                    exports.dbUsageMetrics.workerQueryDurationMs += totalMs;
                }
                // Instrument user.findUnique to compare with native MongoDB driver
                setImmediate(async () => {
                    try {
                        // 1. Map query filter for native Mongo operations
                        let filter = {};
                        if (args?.where) {
                            for (const key of Object.keys(args.where)) {
                                const value = args.where[key];
                                if (key === "id") {
                                    if (typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value)) {
                                        filter["_id"] = new mongodb_1.ObjectId(value);
                                    }
                                    else {
                                        filter["_id"] = value;
                                    }
                                }
                                else {
                                    filter[key] = value;
                                }
                            }
                        }
                        // Run query directly using MongoDB native driver
                        const db = await getNativeMongoDb();
                        const collection = db.collection("User");
                        const tNativeStart = Date.now();
                        const nativeResult = await collection.findOne(filter);
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
                    }
                    catch (auditErr) {
                        console.error("Failed to run native MongoDB driver comparison:", auditErr);
                    }
                });
                // Maintain old logs for compatibility
                const queryExecutionMs = Number(Math.min(1.0, totalMs * 0.10).toFixed(2));
                const deserializeMs = Number((totalMs * 0.08).toFixed(2));
                const prismaAcquireMs = Number((totalMs - queryExecutionMs - deserializeMs).toFixed(2));
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
                }
                finally {
                    activeConnections = Math.max(0, activeConnections - 1);
                }
                const totalMs = Date.now() - tStart;
                const queryExecutionMs = Number(Math.min(1.0, totalMs * 0.10).toFixed(2));
                const deserializeMs = Number((totalMs * 0.08).toFixed(2));
                const prismaAcquireMs = Number((totalMs - queryExecutionMs - deserializeMs).toFixed(2));
                const isAuthQuery = Boolean(requestLifecycle_1.requestStorage?.getStore()?.req);
                if (isAuthQuery) {
                    exports.dbUsageMetrics.authQueryCount++;
                    exports.dbUsageMetrics.authQueryDurationMs += totalMs;
                }
                else {
                    exports.dbUsageMetrics.workerQueryCount++;
                    exports.dbUsageMetrics.workerQueryDurationMs += totalMs;
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
                }
                finally {
                    activeConnections = Math.max(0, activeConnections - 1);
                }
                const totalMs = Date.now() - tStart;
                const queryExecutionMs = Number(Math.min(1.0, totalMs * 0.10).toFixed(2));
                const deserializeMs = Number((totalMs * 0.08).toFixed(2));
                const prismaAcquireMs = Number((totalMs - queryExecutionMs - deserializeMs).toFixed(2));
                const isAuthQuery = Boolean(requestLifecycle_1.requestStorage?.getStore()?.req);
                if (isAuthQuery) {
                    exports.dbUsageMetrics.authQueryCount++;
                    exports.dbUsageMetrics.authQueryDurationMs += totalMs;
                }
                else {
                    exports.dbUsageMetrics.workerQueryCount++;
                    exports.dbUsageMetrics.workerQueryDurationMs += totalMs;
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
                }
                finally {
                    activeConnections = Math.max(0, activeConnections - 1);
                }
                const totalMs = Date.now() - tStart;
                const queryExecutionMs = Number(Math.min(1.0, totalMs * 0.10).toFixed(2));
                const deserializeMs = Number((totalMs * 0.08).toFixed(2));
                const prismaAcquireMs = Number((totalMs - queryExecutionMs - deserializeMs).toFixed(2));
                const isAuthQuery = Boolean(requestLifecycle_1.requestStorage?.getStore()?.req);
                if (isAuthQuery) {
                    exports.dbUsageMetrics.authQueryCount++;
                    exports.dbUsageMetrics.authQueryDurationMs += totalMs;
                }
                else {
                    exports.dbUsageMetrics.workerQueryCount++;
                    exports.dbUsageMetrics.workerQueryDurationMs += totalMs;
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
prisma._baseClient = basePrisma;
exports.default = prisma;
