"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.protect = exports.primeAuthContextCacheForToken = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const AppError_1 = require("../utils/AppError");
const crypto_1 = __importDefault(require("crypto"));
const redis_1 = __importDefault(require("../config/redis"));
const performanceMetrics_1 = require("../observability/performanceMetrics");
const generateToken_1 = require("../utils/generateToken");
const authCookies_1 = require("../utils/authCookies");
const requestContext_1 = require("../observability/requestContext");
const tenant_service_1 = require("../services/tenant.service");
const securityGovernanceOS_service_1 = require("../services/security/securityGovernanceOS.service");
const requestLifecycle_1 = require("../utils/requestLifecycle");
const boundedTimeout_1 = require("../utils/boundedTimeout");
const AUTH_CONTEXT_CACHE_TTL_MS = 15000;
const AUTH_REDIS_CACHE_PREFIX = "auth:context:v1:";
const AUTH_REDIS_CACHE_TTL_SECONDS = Math.max(5, Math.ceil(AUTH_CONTEXT_CACHE_TTL_MS / 1000));
const AUTH_DB_MIN_BUDGET_MS = 360;
const AUTH_DB_SOFT_BUDGET_MS = 1800;
const AUTH_STAGE_TIMEOUT_BUFFER_MS = 140;
const AUTH_REDIS_STAGE_TIMEOUT_MS = 240;
const AUTH_USER_STAGE_TIMEOUT_MS = 900;
const AUTH_WORKSPACE_STAGE_TIMEOUT_MS = 600;
const AUTH_REFRESH_TOKEN_STAGE_TIMEOUT_MS = 900;
const AUTH_STATS_LOG_INTERVAL_MS = 60000;
const SESSION_ANOMALY_RECHECK_MS = 10000;
const SESSION_ANOMALY_GUARD_TIMEOUT_MS = 180;
const SESSION_ANOMALY_SYNC_PATH_PREFIXES = [
    "/api/billing/checkout",
    "/api/security",
    "/api/auth",
    "/api/oauth",
    "/api/commerce",
];
const SESSION_ANOMALY_ASYNC_GUARD_TIMEOUT_MS = 80;
const authContextCache = new Map();
const authContextInFlight = new Map();
const refreshAuthInFlight = new Map();
const sessionAnomalyCheckedAt = new Map();
const authStats = {
    total: 0,
    memoryHit: 0,
    redisHit: 0,
    dbFallback: 0,
    coalescedWait: 0,
    deniedByBudget: 0,
};
let authStatsLastLoggedAt = Date.now();
const hashToken = (token) => crypto_1.default.createHash("sha256").update(token).digest("hex");
const getAuthRedisCacheKey = (tokenKey) => `${AUTH_REDIS_CACHE_PREFIX}${tokenKey}`;
const getAuthBudgetMs = (req, res) => Math.max(1, Math.min(AUTH_DB_SOFT_BUDGET_MS, (0, requestLifecycle_1.getRequestRemainingMs)({
    req,
    res: res || null,
}, AUTH_DB_SOFT_BUDGET_MS) - 120));
const isRequestClosed = (req, res) => (0, requestLifecycle_1.isRequestLifecycleAborted)({
    req,
    res: res || null,
}) || Boolean(res?.headersSent) || Boolean(res?.writableEnded);
const getRequestLocalAuthState = (req) => {
    const authReq = req;
    if (!authReq.__localAuthState) {
        authReq.__localAuthState = {
            accessTokenKey: null,
            accessTokenVersion: null,
            accessContext: null,
            accessLookupKey: null,
            accessLookupPromise: null,
            refreshLookupKey: null,
            refreshLookupPromise: null,
        };
    }
    return authReq.__localAuthState;
};
const readRequestLocalAuthContext = (req, tokenKey, tokenVersion) => {
    const localState = getRequestLocalAuthState(req);
    if (localState.accessTokenKey !== tokenKey ||
        localState.accessTokenVersion !== tokenVersion) {
        return null;
    }
    if (!localState.accessContext ||
        localState.accessContext.expiresAt <= Date.now() ||
        localState.accessContext.tokenVersion !== tokenVersion) {
        localState.accessContext = null;
        return null;
    }
    return localState.accessContext;
};
const writeRequestLocalAuthContext = (req, tokenKey, tokenVersion, context) => {
    const localState = getRequestLocalAuthState(req);
    localState.accessTokenKey = tokenKey;
    localState.accessTokenVersion = tokenVersion;
    localState.accessContext = context;
};
const readRequestLocalLookupPromise = (req, kind, key) => {
    const localState = getRequestLocalAuthState(req);
    if (kind === "access") {
        if (localState.accessLookupKey !== key) {
            return null;
        }
        return localState.accessLookupPromise;
    }
    if (localState.refreshLookupKey !== key) {
        return null;
    }
    return localState.refreshLookupPromise;
};
const writeRequestLocalLookupPromise = (req, kind, key, promise) => {
    const localState = getRequestLocalAuthState(req);
    if (kind === "access") {
        localState.accessLookupKey = key;
        localState.accessLookupPromise = promise;
        return;
    }
    localState.refreshLookupKey = key;
    localState.refreshLookupPromise = promise;
};
const clearRequestLocalLookupPromise = (req, kind, key) => {
    const localState = getRequestLocalAuthState(req);
    if (kind === "access") {
        if (localState.accessLookupKey === key) {
            localState.accessLookupKey = null;
            localState.accessLookupPromise = null;
        }
        return;
    }
    if (localState.refreshLookupKey === key) {
        localState.refreshLookupKey = null;
        localState.refreshLookupPromise = null;
    }
};
const isRequestAbortedError = (error) => String(error?.message || "").includes("request_aborted:");
const isAuthBudgetExhaustedError = (error) => String(error?.message || "").includes("auth_budget_exhausted:");
const isAuthStageTimeoutError = (error) => error instanceof boundedTimeout_1.TimeoutExceededError ||
    String(error?.message || "").includes("timeout_exceeded:auth_");
const isAuthNonFatalLookupError = (error) => isRequestAbortedError(error) ||
    isAuthBudgetExhaustedError(error) ||
    isAuthStageTimeoutError(error);
const resolveAuthStageTimeoutMs = (input) => {
    const requestBudgetMs = getAuthBudgetMs(input.req, input.res || undefined);
    const remainingMs = (0, requestLifecycle_1.getRequestRemainingMs)({
        req: input.req,
        res: input.res || null,
    }, AUTH_DB_SOFT_BUDGET_MS);
    return Math.max(1, Math.min(Math.max(1, Math.floor(input.maxTimeoutMs)), requestBudgetMs, Math.max(1, remainingMs - AUTH_STAGE_TIMEOUT_BUFFER_MS)));
};
const raceWithAbortSignal = async (input) => {
    if (!input.signal) {
        return input.task;
    }
    if (input.signal.aborted) {
        throw new Error(`request_aborted:${input.stage}:signal_pre_aborted`);
    }
    return await new Promise((resolve, reject) => {
        let settled = false;
        const onAbort = () => {
            if (settled) {
                return;
            }
            settled = true;
            reject(new Error(`request_aborted:${input.stage}:signal_aborted`));
        };
        input.signal?.addEventListener("abort", onAbort, { once: true });
        void input.task
            .then((value) => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(value);
        })
            .catch((error) => {
            if (settled) {
                return;
            }
            settled = true;
            reject(error);
        })
            .finally(() => {
            input.signal?.removeEventListener("abort", onAbort);
        });
    });
};
const runAuthStage = async (input) => {
    if (isRequestClosed(input.req, input.res || null)) {
        throw new Error(`request_aborted:${input.stage}:request_closed_pre`);
    }
    const timeoutMs = resolveAuthStageTimeoutMs({
        req: input.req,
        res: input.res || null,
        maxTimeoutMs: input.maxTimeoutMs,
    });
    const minBudgetMs = Math.max(1, Math.floor(input.minBudgetMs || 1));
    if (timeoutMs < minBudgetMs) {
        throw new Error(`auth_budget_exhausted:${input.stage}:${timeoutMs}`);
    }
    const signal = (0, requestLifecycle_1.getRequestAbortSignal)({
        req: input.req,
        res: input.res || null,
    });
    const task = raceWithAbortSignal({
        task: input.task(),
        signal,
        stage: input.stage,
    });
    const value = await (0, boundedTimeout_1.withTimeout)({
        label: `auth_${input.stage}`,
        timeoutMs,
        task,
    });
    if (isRequestClosed(input.req, input.res || null)) {
        throw new Error(`request_aborted:${input.stage}:request_closed_post`);
    }
    return value;
};
const runSharedAuthStage = async (input) => (0, boundedTimeout_1.withTimeout)({
    label: `auth_shared_${input.stage}`,
    timeoutMs: Math.max(1, Math.floor(input.maxTimeoutMs)),
    task: input.task(),
});
const bumpAuthStats = (update) => {
    authStats.total += Number(update.resolved || 0);
    authStats.memoryHit += Number(update.memoryHit || 0);
    authStats.redisHit += Number(update.redisHit || 0);
    authStats.dbFallback += Number(update.dbFallback || 0);
    authStats.coalescedWait += Number(update.coalescedWait || 0);
    authStats.deniedByBudget += Number(update.deniedByBudget || 0);
    if (Date.now() - authStatsLastLoggedAt < AUTH_STATS_LOG_INTERVAL_MS) {
        return;
    }
    authStatsLastLoggedAt = Date.now();
    const total = Math.max(authStats.total, 1);
    console.info("AUTH_CACHE_STATS", {
        total: authStats.total,
        memoryHitRatio: Number((authStats.memoryHit / total).toFixed(3)),
        redisHitRatio: Number((authStats.redisHit / total).toFixed(3)),
        dbFallbackRatio: Number((authStats.dbFallback / total).toFixed(3)),
        coalescedWaitRatio: Number((authStats.coalescedWait / total).toFixed(3)),
        deniedByBudgetRatio: Number((authStats.deniedByBudget / total).toFixed(3)),
        inflightAuthLookups: authContextInFlight.size,
    });
    authStats.total = 0;
    authStats.memoryHit = 0;
    authStats.redisHit = 0;
    authStats.dbFallback = 0;
    authStats.coalescedWait = 0;
    authStats.deniedByBudget = 0;
};
const readMemoryAuthContext = (tokenKey, tokenVersion) => {
    const cachedContext = authContextCache.get(tokenKey);
    if (!cachedContext) {
        return null;
    }
    if (cachedContext.expiresAt <= Date.now() ||
        cachedContext.tokenVersion !== tokenVersion) {
        authContextCache.delete(tokenKey);
        return null;
    }
    return cachedContext;
};
const isValidCachedContext = (context) => {
    if (!context || typeof context !== "object" || Array.isArray(context)) {
        return false;
    }
    const record = context;
    return (typeof record.userId === "string" &&
        typeof record.role === "string" &&
        typeof record.tokenVersion === "number" &&
        typeof record.expiresAt === "number");
};
const readRedisAuthContext = async (tokenKey, tokenVersion) => {
    const cachedRaw = await redis_1.default
        .get(getAuthRedisCacheKey(tokenKey))
        .catch(() => null);
    if (!cachedRaw) {
        return null;
    }
    try {
        const parsed = JSON.parse(cachedRaw);
        if (!isValidCachedContext(parsed)) {
            await redis_1.default.del(getAuthRedisCacheKey(tokenKey)).catch(() => undefined);
            return null;
        }
        if (parsed.expiresAt <= Date.now() || parsed.tokenVersion !== tokenVersion) {
            await redis_1.default.del(getAuthRedisCacheKey(tokenKey)).catch(() => undefined);
            return null;
        }
        authContextCache.set(tokenKey, parsed);
        return parsed;
    }
    catch {
        await redis_1.default.del(getAuthRedisCacheKey(tokenKey)).catch(() => undefined);
        return null;
    }
};
const writeAuthContextCache = async (tokenKey, context) => {
    authContextCache.set(tokenKey, context);
    await redis_1.default
        .set(getAuthRedisCacheKey(tokenKey), JSON.stringify(context), "EX", AUTH_REDIS_CACHE_TTL_SECONDS)
        .catch(() => undefined);
};
const primeAuthContextCacheForToken = (input) => {
    const accessToken = String(input.accessToken || "").trim();
    if (!accessToken) {
        return;
    }
    const tokenKey = hashToken(accessToken);
    const context = {
        userId: String(input.userId || "").trim(),
        role: String(input.role || "").trim() || "AGENT",
        tokenVersion: Number(input.tokenVersion || 0),
        businessId: String(input.businessId || "").trim() || null,
        email: String(input.email || "").trim() || undefined,
        expiresAt: Date.now() + AUTH_CONTEXT_CACHE_TTL_MS,
    };
    if (!context.userId || !Number.isFinite(context.tokenVersion)) {
        return;
    }
    authContextCache.set(tokenKey, context);
    void writeAuthContextCache(tokenKey, context);
};
exports.primeAuthContextCacheForToken = primeAuthContextCacheForToken;
const getUserWithBusiness = async (userId) => prisma_1.default.user.findUnique({
    where: { id: userId },
    select: {
        id: true,
        role: true,
        isActive: true,
        deletedAt: true,
        tokenVersion: true,
        email: true,
        businessId: true,
    },
});
const bindAuthenticatedContext = (req, user) => {
    req.user = user;
    req.businessId = user.businessId;
    req.tenant = {
        businessId: user.businessId,
    };
    (0, requestContext_1.updateRequestContext)({
        userId: user.id,
        businessId: user.businessId,
        tenantId: user.businessId,
    });
};
const getIpAddress = (req) => req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    req.ip ||
    "unknown";
const getUserAgent = (req) => {
    const value = req.headers["user-agent"];
    return Array.isArray(value) ? value[0] : String(value || "unknown");
};
const getSessionKeyFromRequest = (req) => {
    const refreshToken = req.cookies?.refreshToken;
    const accessToken = req.cookies?.accessToken;
    const raw = String(refreshToken || accessToken || req.requestId || "").trim();
    return raw ? hashToken(raw) : null;
};
const resolveBusinessId = async (input) => {
    const fastPathBusinessId = String(input.userBusinessId || "").trim() ||
        String(input.preferredBusinessId || "").trim() ||
        null;
    if (fastPathBusinessId) {
        return fastPathBusinessId;
    }
    if (input.allowWorkspaceFallback === false) {
        return null;
    }
    const identity = await (0, tenant_service_1.resolveUserWorkspaceIdentity)({
        userId: input.userId,
        preferredBusinessId: input.preferredBusinessId || null,
        bootstrapWorkspaceIfMissing: false,
        persistResolvedBusinessId: false,
    });
    return identity.businessId;
};
const shouldUseShallowWorkspaceResolution = (req) => {
    const path = String(req.path || req.originalUrl || req.url || "").trim();
    const surface = String(req.query?.surface || "")
        .trim()
        .toLowerCase();
    return (surface === "auth" ||
        path.startsWith("/api/user/me") ||
        path.startsWith("/api/auth/me"));
};
const enforceSessionAnomalyGuard = async (req, input) => {
    if (input.signal?.aborted || (0, requestLifecycle_1.isRequestLifecycleAborted)({ req })) {
        return;
    }
    const sessionKey = getSessionKeyFromRequest(req);
    if (!sessionKey) {
        return;
    }
    const now = Date.now();
    const lastCheckedAt = sessionAnomalyCheckedAt.get(sessionKey) || 0;
    if (now - lastCheckedAt < SESSION_ANOMALY_RECHECK_MS) {
        return;
    }
    sessionAnomalyCheckedAt.set(sessionKey, now);
    const anomaly = await (0, securityGovernanceOS_service_1.trackSessionAnomaly)({
        sessionKey,
        businessId: input.businessId,
        tenantId: input.businessId,
        userId: input.userId,
        ip: getIpAddress(req),
        userAgent: getUserAgent(req),
        deviceId: String(req.headers["x-device-id"] || "").trim() || null,
        signal: input.signal || null,
    }).catch(() => null);
    if (input.signal?.aborted || (0, requestLifecycle_1.isRequestLifecycleAborted)({ req })) {
        return;
    }
    if (anomaly?.locked) {
        throw (0, AppError_1.unauthorized)("Session locked due to anomaly");
    }
    if (anomaly?.challengeRequired) {
        const challengeHeader = Array.isArray(req.headers["x-mfa-challenge"])
            ? req.headers["x-mfa-challenge"][0]
            : req.headers["x-mfa-challenge"];
        const challengeKey = String(challengeHeader || "").trim();
        if (!challengeKey) {
            throw (0, AppError_1.unauthorized)(`Suspicious login challenge required${anomaly?.challengeKey ? ` (${anomaly.challengeKey})` : ""}`);
        }
        const consumed = await (0, securityGovernanceOS_service_1.authorizeSuspiciousSessionChallenge)({
            challengeKey,
            userId: input.userId,
            sessionKey,
            signal: input.signal || null,
        }).catch(() => ({
            consumed: false,
            reason: "mfa_challenge_consume_failed",
        }));
        if (!consumed.consumed) {
            throw (0, AppError_1.unauthorized)("Suspicious login challenge not satisfied");
        }
    }
};
const runSessionAnomalyGuard = async (req, input) => {
    const route = String(req.originalUrl || req.url || "").trim();
    const shouldEnforceSynchronously = req.method !== "GET" ||
        SESSION_ANOMALY_SYNC_PATH_PREFIXES.some((prefix) => route.startsWith(prefix));
    const requestBudgetMs = (0, requestLifecycle_1.getRequestRemainingMs)({ req }, SESSION_ANOMALY_GUARD_TIMEOUT_MS);
    const minimumRequiredBudgetMs = shouldEnforceSynchronously ? 500 : 280;
    if ((0, requestLifecycle_1.isRequestLifecycleAborted)({ req }) || requestBudgetMs <= minimumRequiredBudgetMs) {
        req.logger?.warn({
            error: "session_anomaly_guard_timeout",
            route,
            method: req.method,
            requestBudgetMs,
        }, "Session anomaly guard skipped");
        return;
    }
    const abortSignal = (0, requestLifecycle_1.getRequestAbortSignal)({ req });
    const runGuard = async () => {
        try {
            await enforceSessionAnomalyGuard(req, {
                ...input,
                signal: abortSignal,
            });
        }
        catch (error) {
            if (String(error?.message || "").includes("request_aborted")) {
                return;
            }
            // Fail open: auth should remain responsive even if anomaly telemetry is slow.
            req.logger?.warn({
                error: error?.message || String(error || "unknown"),
                route,
                method: req.method,
                timeoutMs: shouldEnforceSynchronously
                    ? SESSION_ANOMALY_GUARD_TIMEOUT_MS
                    : SESSION_ANOMALY_ASYNC_GUARD_TIMEOUT_MS,
            }, "Session anomaly guard skipped");
        }
    };
    if (shouldEnforceSynchronously) {
        await runGuard();
        return;
    }
    void runGuard();
};
const protect = async (req, res, next) => {
    const startedAt = Date.now();
    try {
        if (isRequestClosed(req, res)) {
            return;
        }
        if (req.user?.id && typeof req.user.role === "string") {
            bindAuthenticatedContext(req, {
                id: req.user.id,
                role: req.user.role,
                email: req.user.email,
                businessId: req.user.businessId || null,
            });
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "AUTH_MS",
                value: Date.now() - startedAt,
                businessId: req.user.businessId || null,
                route: req.originalUrl,
                metadata: {
                    source: "prebound",
                },
            });
            if (isRequestClosed(req, res)) {
                return;
            }
            return next();
        }
        if (process.env.NODE_ENV === "integration" &&
            process.env.INTEGRATION_AUTH_BYPASS === "true") {
            const testUserIdHeader = req.headers["x-test-user-id"];
            const testBusinessIdHeader = req.headers["x-test-business-id"];
            const testRoleHeader = req.headers["x-test-user-role"];
            const testUserId = Array.isArray(testUserIdHeader)
                ? testUserIdHeader[0]
                : testUserIdHeader;
            const testBusinessId = Array.isArray(testBusinessIdHeader)
                ? testBusinessIdHeader[0]
                : testBusinessIdHeader;
            const testRole = Array.isArray(testRoleHeader)
                ? testRoleHeader[0]
                : testRoleHeader;
            if (typeof testUserId === "string" &&
                testUserId.trim() &&
                typeof testBusinessId === "string" &&
                testBusinessId.trim()) {
                bindAuthenticatedContext(req, {
                    id: testUserId.trim(),
                    role: String(testRole || "OWNER").trim() || "OWNER",
                    businessId: testBusinessId.trim(),
                });
                (0, performanceMetrics_1.emitPerformanceMetric)({
                    name: "AUTH_MS",
                    value: Date.now() - startedAt,
                    businessId: testBusinessId.trim(),
                    route: req.originalUrl,
                    metadata: {
                        source: "integration_bypass",
                    },
                });
                if (isRequestClosed(req, res)) {
                    return;
                }
                return next();
            }
        }
        const accessToken = req.cookies?.accessToken;
        const refreshToken = req.cookies?.refreshToken;
        if (!accessToken && !refreshToken) {
            throw (0, AppError_1.unauthorized)("Missing session");
        }
        if (accessToken) {
            const decoded = (0, generateToken_1.verifyAccessToken)(accessToken);
            const accessTokenKey = hashToken(accessToken);
            if (decoded?.id && typeof decoded.tokenVersion === "number") {
                const requestLocalContext = readRequestLocalAuthContext(req, accessTokenKey, decoded.tokenVersion);
                if (requestLocalContext) {
                    bindAuthenticatedContext(req, {
                        id: requestLocalContext.userId,
                        role: requestLocalContext.role,
                        email: requestLocalContext.email,
                        businessId: requestLocalContext.businessId,
                    });
                    await runSessionAnomalyGuard(req, {
                        userId: requestLocalContext.userId,
                        businessId: requestLocalContext.businessId,
                    });
                    bumpAuthStats({
                        resolved: 1,
                        memoryHit: 1,
                    });
                    (0, performanceMetrics_1.emitPerformanceMetric)({
                        name: "CACHE_HIT",
                        businessId: requestLocalContext.businessId,
                        route: req.originalUrl,
                        metadata: {
                            cache: "request_local_auth_context",
                        },
                    });
                    (0, performanceMetrics_1.emitPerformanceMetric)({
                        name: "AUTH_MS",
                        value: Date.now() - startedAt,
                        businessId: requestLocalContext.businessId,
                        route: req.originalUrl,
                        metadata: {
                            source: "request_local_auth_context",
                            inflightAuthLookups: authContextInFlight.size,
                        },
                    });
                    if (isRequestClosed(req, res)) {
                        return;
                    }
                    return next();
                }
                const localAccessLookupKey = `${accessTokenKey}:${decoded.tokenVersion}`;
                const requestLocalLookup = readRequestLocalLookupPromise(req, "access", localAccessLookupKey);
                if (requestLocalLookup) {
                    bumpAuthStats({
                        coalescedWait: 1,
                    });
                    let resolvedFromRequestLocalLookup = null;
                    try {
                        resolvedFromRequestLocalLookup = await runAuthStage({
                            req,
                            res,
                            stage: "access_lookup_wait",
                            maxTimeoutMs: AUTH_USER_STAGE_TIMEOUT_MS,
                            minBudgetMs: 120,
                            task: () => requestLocalLookup,
                        });
                    }
                    catch (error) {
                        if (!isAuthNonFatalLookupError(error)) {
                            throw error;
                        }
                    }
                    if (resolvedFromRequestLocalLookup) {
                        writeRequestLocalAuthContext(req, accessTokenKey, decoded.tokenVersion, resolvedFromRequestLocalLookup);
                        bindAuthenticatedContext(req, {
                            id: resolvedFromRequestLocalLookup.userId,
                            role: resolvedFromRequestLocalLookup.role,
                            email: resolvedFromRequestLocalLookup.email,
                            businessId: resolvedFromRequestLocalLookup.businessId,
                        });
                        await runSessionAnomalyGuard(req, {
                            userId: resolvedFromRequestLocalLookup.userId,
                            businessId: resolvedFromRequestLocalLookup.businessId,
                        });
                        bumpAuthStats({
                            resolved: 1,
                            dbFallback: 1,
                        });
                        (0, performanceMetrics_1.emitPerformanceMetric)({
                            name: "AUTH_MS",
                            value: Date.now() - startedAt,
                            businessId: resolvedFromRequestLocalLookup.businessId,
                            route: req.originalUrl,
                            metadata: {
                                source: "access_token_request_local_coalesced",
                                inflightAuthLookups: authContextInFlight.size,
                            },
                        });
                        if (isRequestClosed(req, res)) {
                            return;
                        }
                        return next();
                    }
                }
                const cachedContext = readMemoryAuthContext(accessTokenKey, decoded.tokenVersion);
                if (cachedContext) {
                    writeRequestLocalAuthContext(req, accessTokenKey, decoded.tokenVersion, cachedContext);
                    bindAuthenticatedContext(req, {
                        id: cachedContext.userId,
                        role: cachedContext.role,
                        email: cachedContext.email,
                        businessId: cachedContext.businessId,
                    });
                    await runSessionAnomalyGuard(req, {
                        userId: cachedContext.userId,
                        businessId: cachedContext.businessId,
                    });
                    bumpAuthStats({
                        resolved: 1,
                        memoryHit: 1,
                    });
                    (0, performanceMetrics_1.emitPerformanceMetric)({
                        name: "CACHE_HIT",
                        businessId: cachedContext.businessId,
                        route: req.originalUrl,
                        metadata: {
                            cache: "memory_auth_context",
                        },
                    });
                    (0, performanceMetrics_1.emitPerformanceMetric)({
                        name: "AUTH_MS",
                        value: Date.now() - startedAt,
                        businessId: cachedContext.businessId,
                        route: req.originalUrl,
                        metadata: {
                            source: "access_token_memory_cache",
                            inflightAuthLookups: authContextInFlight.size,
                        },
                    });
                    if (isRequestClosed(req, res)) {
                        return;
                    }
                    return next();
                }
                (0, performanceMetrics_1.emitPerformanceMetric)({
                    name: "CACHE_MISS",
                    route: req.originalUrl,
                    metadata: {
                        cache: "auth_context",
                    },
                });
                let redisContext = null;
                try {
                    redisContext = await runAuthStage({
                        req,
                        res,
                        stage: "access_redis_lookup",
                        maxTimeoutMs: AUTH_REDIS_STAGE_TIMEOUT_MS,
                        minBudgetMs: 60,
                        task: () => readRedisAuthContext(accessTokenKey, decoded.tokenVersion),
                    });
                }
                catch (error) {
                    if (isAuthNonFatalLookupError(error)) {
                        req.logger?.warn({
                            route: req.originalUrl,
                            method: req.method,
                            requestId: req.requestId || null,
                            stage: "access_redis_lookup",
                            error: error?.message || String(error || "unknown"),
                        }, "Skipping access-token redis lookup due to request budget/timeout");
                    }
                    else {
                        throw error;
                    }
                }
                if (redisContext) {
                    writeRequestLocalAuthContext(req, accessTokenKey, decoded.tokenVersion, redisContext);
                    bindAuthenticatedContext(req, {
                        id: redisContext.userId,
                        role: redisContext.role,
                        email: redisContext.email,
                        businessId: redisContext.businessId,
                    });
                    await runSessionAnomalyGuard(req, {
                        userId: redisContext.userId,
                        businessId: redisContext.businessId,
                    });
                    bumpAuthStats({
                        resolved: 1,
                        redisHit: 1,
                    });
                    (0, performanceMetrics_1.emitPerformanceMetric)({
                        name: "CACHE_HIT",
                        businessId: redisContext.businessId,
                        route: req.originalUrl,
                        metadata: {
                            cache: "redis_auth_context",
                        },
                    });
                    (0, performanceMetrics_1.emitPerformanceMetric)({
                        name: "AUTH_MS",
                        value: Date.now() - startedAt,
                        businessId: redisContext.businessId,
                        route: req.originalUrl,
                        metadata: {
                            source: "access_token_redis_cache",
                            inflightAuthLookups: authContextInFlight.size,
                        },
                    });
                    if (isRequestClosed(req, res)) {
                        return;
                    }
                    return next();
                }
                if (isRequestClosed(req, res)) {
                    return;
                }
                const existingLookup = authContextInFlight.get(accessTokenKey);
                if (existingLookup) {
                    bumpAuthStats({
                        coalescedWait: 1,
                    });
                }
                const canUseDbFallback = getAuthBudgetMs(req, res) >= AUTH_DB_MIN_BUDGET_MS;
                if (!existingLookup && !canUseDbFallback) {
                    bumpAuthStats({
                        deniedByBudget: 1,
                    });
                    req.logger?.warn({
                        route: req.originalUrl,
                        method: req.method,
                        requestId: req.requestId || null,
                        remainingMs: (0, requestLifecycle_1.getRequestRemainingMs)({ req, res }, AUTH_DB_SOFT_BUDGET_MS),
                        budgetMinMs: AUTH_DB_MIN_BUDGET_MS,
                    }, "Skipping auth DB fallback due to low request budget");
                }
                else {
                    const lookupPromise = existingLookup ||
                        (async () => {
                            const user = await runSharedAuthStage({
                                stage: "access_user_lookup",
                                maxTimeoutMs: AUTH_USER_STAGE_TIMEOUT_MS,
                                task: () => getUserWithBusiness(decoded.id),
                            });
                            if (!user ||
                                !user.isActive ||
                                user.deletedAt ||
                                user.tokenVersion !== decoded.tokenVersion) {
                                return null;
                            }
                            const businessId = await runSharedAuthStage({
                                stage: "access_business_lookup",
                                maxTimeoutMs: AUTH_WORKSPACE_STAGE_TIMEOUT_MS,
                                task: () => resolveBusinessId({
                                    userId: user.id,
                                    userBusinessId: user.businessId || null,
                                    preferredBusinessId: decoded.businessId || null,
                                    allowWorkspaceFallback: !shouldUseShallowWorkspaceResolution(req),
                                }),
                            });
                            const resolvedContext = {
                                userId: user.id,
                                role: user.role,
                                email: user.email,
                                businessId,
                                tokenVersion: user.tokenVersion,
                                expiresAt: Date.now() + AUTH_CONTEXT_CACHE_TTL_MS,
                            };
                            void writeAuthContextCache(accessTokenKey, resolvedContext);
                            return resolvedContext;
                        })()
                            .catch((error) => {
                            if (!isAuthNonFatalLookupError(error)) {
                                throw error;
                            }
                            req.logger?.warn({
                                route: req.originalUrl,
                                method: req.method,
                                requestId: req.requestId || null,
                                stage: "access_db_lookup",
                                error: error?.message || String(error || "unknown"),
                            }, "Skipping access-token DB fallback due to request budget/timeout");
                            return null;
                        })
                            .finally(() => {
                            authContextInFlight.delete(accessTokenKey);
                        });
                    if (!existingLookup) {
                        authContextInFlight.set(accessTokenKey, lookupPromise);
                    }
                    writeRequestLocalLookupPromise(req, "access", localAccessLookupKey, lookupPromise);
                    let resolvedContext = null;
                    try {
                        resolvedContext = await runAuthStage({
                            req,
                            res,
                            stage: "access_lookup_wait",
                            maxTimeoutMs: AUTH_USER_STAGE_TIMEOUT_MS,
                            minBudgetMs: 120,
                            task: () => lookupPromise,
                        });
                    }
                    catch (error) {
                        if (!isAuthNonFatalLookupError(error)) {
                            throw error;
                        }
                    }
                    finally {
                        clearRequestLocalLookupPromise(req, "access", localAccessLookupKey);
                    }
                    if (resolvedContext) {
                        writeRequestLocalAuthContext(req, accessTokenKey, decoded.tokenVersion, resolvedContext);
                        bindAuthenticatedContext(req, {
                            id: resolvedContext.userId,
                            role: resolvedContext.role,
                            email: resolvedContext.email,
                            businessId: resolvedContext.businessId,
                        });
                        await runSessionAnomalyGuard(req, {
                            userId: resolvedContext.userId,
                            businessId: resolvedContext.businessId,
                        });
                        bumpAuthStats({
                            resolved: 1,
                            dbFallback: 1,
                        });
                        (0, performanceMetrics_1.emitPerformanceMetric)({
                            name: "AUTH_MS",
                            value: Date.now() - startedAt,
                            businessId: resolvedContext.businessId,
                            route: req.originalUrl,
                            metadata: {
                                source: existingLookup ? "access_token_db_coalesced" : "access_token_db",
                                inflightAuthLookups: authContextInFlight.size,
                            },
                        });
                        if (isRequestClosed(req, res)) {
                            return;
                        }
                        return next();
                    }
                }
            }
        }
        if (isRequestClosed(req, res)) {
            return;
        }
        if (!refreshToken) {
            throw (0, AppError_1.unauthorized)("Session expired");
        }
        const decoded = (0, generateToken_1.verifyRefreshToken)(refreshToken);
        if (!decoded?.id || typeof decoded.tokenVersion !== "number") {
            (0, authCookies_1.clearAuthCookies)(res, req);
            throw (0, AppError_1.unauthorized)("Invalid refresh token");
        }
        const hashed = hashToken(refreshToken);
        const refreshLookupKey = `${hashed}:${decoded.id}:${decoded.tokenVersion}`;
        const requestLocalRefreshLookup = readRequestLocalLookupPromise(req, "refresh", refreshLookupKey);
        const sharedRefreshLookup = requestLocalRefreshLookup || refreshAuthInFlight.get(refreshLookupKey) || null;
        if (!sharedRefreshLookup && getAuthBudgetMs(req, res) < AUTH_DB_MIN_BUDGET_MS) {
            bumpAuthStats({
                deniedByBudget: 1,
            });
            throw (0, AppError_1.unauthorized)("Session verification timed out. Please retry.");
        }
        if (sharedRefreshLookup) {
            bumpAuthStats({
                coalescedWait: 1,
            });
        }
        const refreshLookupPromise = sharedRefreshLookup ||
            (async () => {
                const dbToken = await runSharedAuthStage({
                    stage: "refresh_token_lookup",
                    maxTimeoutMs: AUTH_REFRESH_TOKEN_STAGE_TIMEOUT_MS,
                    task: () => prisma_1.default.refreshToken.findUnique({
                        where: {
                            token: hashed,
                        },
                        select: {
                            token: true,
                            userId: true,
                            expiresAt: true,
                        },
                    }),
                });
                if (!dbToken ||
                    dbToken.userId !== decoded.id ||
                    dbToken.expiresAt.getTime() <= Date.now()) {
                    return null;
                }
                const user = await runSharedAuthStage({
                    stage: "refresh_user_lookup",
                    maxTimeoutMs: AUTH_USER_STAGE_TIMEOUT_MS,
                    task: () => getUserWithBusiness(decoded.id),
                });
                if (!user ||
                    !user.isActive ||
                    user.deletedAt ||
                    user.tokenVersion !== decoded.tokenVersion) {
                    return null;
                }
                const businessId = await runSharedAuthStage({
                    stage: "refresh_business_lookup",
                    maxTimeoutMs: AUTH_WORKSPACE_STAGE_TIMEOUT_MS,
                    task: () => resolveBusinessId({
                        userId: user.id,
                        userBusinessId: user.businessId || null,
                        preferredBusinessId: null,
                        allowWorkspaceFallback: !shouldUseShallowWorkspaceResolution(req),
                    }),
                });
                return {
                    userId: user.id,
                    role: user.role,
                    email: user.email || undefined,
                    businessId,
                    tokenVersion: user.tokenVersion,
                    expiresAt: Date.now() + AUTH_CONTEXT_CACHE_TTL_MS,
                };
            })().finally(() => {
                refreshAuthInFlight.delete(refreshLookupKey);
            });
        if (!sharedRefreshLookup) {
            refreshAuthInFlight.set(refreshLookupKey, refreshLookupPromise);
        }
        writeRequestLocalLookupPromise(req, "refresh", refreshLookupKey, refreshLookupPromise);
        let refreshedContext = null;
        try {
            refreshedContext = await runAuthStage({
                req,
                res,
                stage: "refresh_lookup_wait",
                maxTimeoutMs: AUTH_REFRESH_TOKEN_STAGE_TIMEOUT_MS,
                minBudgetMs: AUTH_DB_MIN_BUDGET_MS,
                task: () => refreshLookupPromise,
            });
        }
        catch (error) {
            if (isAuthBudgetExhaustedError(error) ||
                isAuthStageTimeoutError(error)) {
                throw (0, AppError_1.unauthorized)("Session verification timed out. Please retry.");
            }
            throw error;
        }
        finally {
            clearRequestLocalLookupPromise(req, "refresh", refreshLookupKey);
        }
        if (!refreshedContext) {
            (0, authCookies_1.clearAuthCookies)(res, req);
            throw (0, AppError_1.unauthorized)("Session expired");
        }
        if (isRequestClosed(req, res)) {
            return;
        }
        const newAccessToken = (0, generateToken_1.generateAccessToken)(refreshedContext.userId, refreshedContext.role, refreshedContext.businessId, refreshedContext.tokenVersion);
        res.cookie("accessToken", newAccessToken, {
            ...(0, authCookies_1.getAuthCookieOptions)(req),
            maxAge: 15 * 60 * 1000,
        });
        bindAuthenticatedContext(req, {
            id: refreshedContext.userId,
            role: refreshedContext.role,
            email: refreshedContext.email,
            businessId: refreshedContext.businessId,
        });
        writeRequestLocalAuthContext(req, hashToken(newAccessToken), refreshedContext.tokenVersion, {
            ...refreshedContext,
            expiresAt: Date.now() + AUTH_CONTEXT_CACHE_TTL_MS,
        });
        await runSessionAnomalyGuard(req, {
            userId: refreshedContext.userId,
            businessId: refreshedContext.businessId,
        });
        if (isRequestClosed(req, res)) {
            return;
        }
        void writeAuthContextCache(hashToken(newAccessToken), {
            userId: refreshedContext.userId,
            role: refreshedContext.role,
            email: refreshedContext.email,
            businessId: refreshedContext.businessId,
            tokenVersion: refreshedContext.tokenVersion,
            expiresAt: Date.now() + AUTH_CONTEXT_CACHE_TTL_MS,
        });
        bumpAuthStats({
            resolved: 1,
            dbFallback: 1,
        });
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "AUTH_MS",
            value: Date.now() - startedAt,
            businessId: refreshedContext.businessId,
            route: req.originalUrl,
            metadata: {
                source: "refresh_token",
            },
        });
        return next();
    }
    catch (err) {
        if (isRequestClosed(req, res) || isRequestAbortedError(err)) {
            return;
        }
        return next(err);
    }
};
exports.protect = protect;
