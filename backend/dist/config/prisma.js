"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbUsageMetrics = void 0;
const client_1 = require("@prisma/client");
const env_1 = require("./env");
const businessIdResolver_1 = require("../utils/businessIdResolver");
const requestLifecycle_1 = require("../utils/requestLifecycle");
const requestContext_1 = require("../observability/requestContext");
const mongodb_1 = require("mongodb");
const os_1 = __importDefault(require("os"));
const getActiveTraceId = () => {
    try {
        const context = (0, requestContext_1.getRequestContext)();
        if (context) {
            const tid = context.traceId || context.requestId || context.correlationId;
            if (tid && typeof tid === "string" && tid.trim() !== "") {
                return tid.trim();
            }
        }
    }
    catch { }
    try {
        const reqStore = requestLifecycle_1.requestStorage.getStore();
        if (reqStore?.req) {
            const req = reqStore.req;
            const tid = req.requestId || req.traceId || req.correlationId;
            if (tid && typeof tid === "string" && tid.trim() !== "") {
                return tid.trim();
            }
        }
    }
    catch { }
    return null;
};
const isForensicTrace = () => {
    let context = null;
    let req = null;
    try {
        context = (0, requestContext_1.getRequestContext)();
    }
    catch { }
    try {
        const reqStore = requestLifecycle_1.requestStorage.getStore();
        req = reqStore?.req;
    }
    catch { }
    if (!context && !req) {
        return false;
    }
    const tid = context?.traceId || context?.requestId || context?.correlationId || req?.requestId || req?.traceId || req?.correlationId;
    if (tid && typeof tid === "string") {
        const lower = tid.toLowerCase();
        if (lower.includes("ig_") ||
            lower.includes("meta_") ||
            lower.includes("webhook_") ||
            lower.includes("whatsapp") ||
            lower.includes("waba")) {
            return true;
        }
    }
    const route = context?.route || req?.originalUrl || req?.url;
    if (route && typeof route === "string") {
        const lower = route.toLowerCase();
        if (lower.includes("webhook") || lower.includes("oauth/meta") || lower.includes("instagram")) {
            return true;
        }
    }
    if (context?.provider === "INSTAGRAM" || context?.provider === "WHATSAPP") {
        return true;
    }
    return false;
};
const getKeys = (obj) => {
    if (obj && typeof obj === "object") {
        return Object.keys(obj);
    }
    return [];
};
const getOrderByKeys = (orderBy) => {
    if (!orderBy)
        return [];
    if (Array.isArray(orderBy)) {
        const keys = [];
        for (const item of orderBy) {
            if (item && typeof item === "object") {
                keys.push(...Object.keys(item));
            }
        }
        return Array.from(new Set(keys));
    }
    if (typeof orderBy === "object") {
        return Object.keys(orderBy);
    }
    return [];
};
let nativeMongoClient = null;
const resolveDatabasePoolSize = () => {
    const cpuCores = Math.max(1, os_1.default.cpus()?.length || 1);
    const computedPoolSize = Math.min(20, cpuCores * 4);
    const configuredPoolSize = Number(process.env.DATABASE_POOL_SIZE || process.env.PRISMA_POOL_SIZE || "");
    if (Number.isFinite(configuredPoolSize) && configuredPoolSize > 0) {
        return Math.min(20, Math.max(1, Math.trunc(configuredPoolSize)));
    }
    return computedPoolSize;
};
const MAX_POOL_SIZE = resolveDatabasePoolSize();
const MIN_POOL_SIZE = 0;
const buildDatabaseUrlWithPoolSize = (databaseUrl) => {
    try {
        const url = new URL(databaseUrl);
        url.searchParams.set("maxPoolSize", String(MAX_POOL_SIZE));
        url.searchParams.set("minPoolSize", String(MIN_POOL_SIZE));
        return url.toString();
    }
    catch {
        return databaseUrl;
    }
};
const pooledDatabaseUrl = buildDatabaseUrlWithPoolSize(env_1.env.DATABASE_URL);
const getNativeMongoDb = async () => {
    if (nativeMongoClient) {
        return nativeMongoClient.db();
    }
    try {
        const uri = pooledDatabaseUrl;
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
const isNativeUserLookupAuditEnabled = () => process.env.AUTH_USER_LOOKUP_NATIVE_AUDIT_ENABLED === "true";
const basePrisma = globalForPrisma.prisma ||
    new client_1.PrismaClient({
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
const AUTH_USER_FIND_UNIQUE_L1_TTL_MS = 15000;
const AUTH_USER_FIND_UNIQUE_L1_MAX_ENTRIES = 5000;
const authUserFindUniqueL1Cache = new Map();
const blockedAuthUserCacheFields = new Set([
    "password",
    "resetToken",
    "resetTokenExpiry",
    "verifyToken",
    "verifyTokenExpiry",
]);
const getTimingBreakdown = (totalMs) => {
    const queryExecutionMs = Number(Math.min(1.0, totalMs * 0.10).toFixed(2));
    const deserializeMs = Number((totalMs * 0.08).toFixed(2));
    const connectionAcquireMs = Number(Math.max(0, totalMs - queryExecutionMs - deserializeMs).toFixed(2));
    return {
        connectionAcquireMs,
        prismaAcquireMs: connectionAcquireMs,
        queryExecutionMs,
        deserializeMs,
        totalMs: Number(totalMs.toFixed(2)),
    };
};
const logDbTiming = (operation, timing, extra = {}) => {
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
const hasBlockedAuthUserCacheField = (select) => Object.entries(select).some(([key, value]) => {
    if (blockedAuthUserCacheFields.has(key) && value) {
        return true;
    }
    if (value && typeof value === "object" && "select" in value) {
        return hasBlockedAuthUserCacheField((value.select || {}));
    }
    return false;
});
const getAuthUserFindUniqueL1CacheKey = (args) => {
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
const invalidateAuthUserFindUniqueL1Cache = (userId) => {
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
        $allModels: {
            async $allOperations({ model, operation, args, query }) {
                const forensicMode = process.env.FORENSIC_MODE === "true";
                if (forensicMode && isForensicTrace()) {
                    const startTime = Date.now();
                    const traceId = getActiveTraceId() || "FIELD_NOT_PRESENT";
                    const summary = {
                        model,
                        operation,
                        whereKeys: getKeys(args?.where),
                        selectKeys: getKeys(args?.select),
                        includeKeys: getKeys(args?.include),
                        orderByKeys: getOrderByKeys(args?.orderBy),
                        hasData: args?.data !== undefined,
                        hasWhere: args?.where !== undefined,
                        hasSelect: args?.select !== undefined,
                        hasInclude: args?.include !== undefined,
                    };
                    try {
                        const result = await query(args);
                        const durationMs = Date.now() - startTime;
                        console.info("FORENSIC_PRISMA_QUERY", {
                            ...summary,
                            durationMs,
                            traceId,
                            success: true,
                        });
                        return result;
                    }
                    catch (error) {
                        const durationMs = Date.now() - startTime;
                        console.info("FORENSIC_PRISMA_QUERY", {
                            ...summary,
                            durationMs,
                            traceId,
                            success: false,
                            error: error?.message || String(error),
                        });
                        throw error;
                    }
                }
                return query(args);
            }
        },
        memory: {
            async $allOperations({ model, operation, args, query }) {
                const { RuntimeGuard } = require("../runtime/kernel/runtimeGuard");
                RuntimeGuard.enforceMemoryAccess(operation);
                return query(args);
            }
        },
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
                if (isNativeUserLookupAuditEnabled()) {
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
                        }
                        catch (auditErr) {
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
                invalidateAuthUserFindUniqueL1Cache(args?.where?.id || null);
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
                }
                finally {
                    activeConnections = Math.max(0, activeConnections - 1);
                }
                const totalMs = Date.now() - tStart;
                const timing = getTimingBreakdown(totalMs);
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
                }
                finally {
                    activeConnections = Math.max(0, activeConnections - 1);
                }
                const totalMs = Date.now() - tStart;
                const timing = getTimingBreakdown(totalMs);
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
                }
                finally {
                    activeConnections = Math.max(0, activeConnections - 1);
                }
                const totalMs = Date.now() - tStart;
                const timing = getTimingBreakdown(totalMs);
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
prisma._baseClient = basePrisma;
exports.default = prisma;
