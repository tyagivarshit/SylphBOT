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
class LightweightMemoryCache {
    constructor(maxKeys = 1000, defaultTtlMs = 15000) {
        this.cache = new Map();
        this.maxKeys = maxKeys;
        this.defaultTtlMs = defaultTtlMs;
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return undefined;
        if (entry.expiresAt <= Date.now()) {
            this.cache.delete(key);
            return undefined;
        }
        return entry.value;
    }
    set(key, value, ttlMs = this.defaultTtlMs) {
        if (this.cache.size >= this.maxKeys) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) {
                this.cache.delete(oldestKey);
            }
        }
        this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
        return this;
    }
    delete(key) {
        return this.cache.delete(key);
    }
    has(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return false;
        if (entry.expiresAt <= Date.now()) {
            this.cache.delete(key);
            return false;
        }
        return true;
    }
    clear() {
        this.cache.clear();
    }
}
const AUTH_CONTEXT_CACHE_TTL_MS = 15000;
const AUTH_SESSION_VALIDITY_MS = 15 * 60 * 1000; // 15 minutes session context validity
const AUTH_REDIS_CACHE_PREFIX = "auth:session:v2:";
const AUTH_REDIS_CACHE_TTL_SECONDS = 15 * 60; // 15 minutes Redis key expiration
const AUTH_DB_MIN_BUDGET_MS = 360;
const AUTH_DB_SOFT_BUDGET_MS = 1800;
const AUTH_STAGE_TIMEOUT_BUFFER_MS = 140;
const AUTH_REDIS_STAGE_TIMEOUT_MS = 240;
const AUTH_USER_STAGE_TIMEOUT_MS = 900;
const AUTH_WORKSPACE_STAGE_TIMEOUT_MS = 600;
const AUTH_REFRESH_TOKEN_STAGE_TIMEOUT_MS = 900;
const AUTH_STALE_VALID_WINDOW_MS = 60000;
const AUTH_STALE_SOFT_EXPIRATION_MS = 25000;
const AUTH_RECENT_VERIFICATION_GRACE_MS = 12000;
const AUTH_SHARED_LOOKUP_MIN_TIMEOUT_MS = 480;
const AUTH_SHARED_LOOKUP_MAX_TIMEOUT_MS = 3200;
const AUTH_SHARED_LOOKUP_ADAPTIVE_MAX_MULTIPLIER = 3.2;
const AUTH_SHARED_LOOKUP_ADAPTIVE_MIN_MULTIPLIER = 1;
const AUTH_DB_FALLBACK_RETRY_ATTEMPTS = 2;
const AUTH_DEADLOCK_RETRY_ATTEMPTS = 2;
const AUTH_DEADLOCK_RETRY_BASE_DELAY_MS = 45;
const AUTH_DEADLOCK_RETRY_MAX_JITTER_MS = 70;
const AUTH_STATS_LOG_INTERVAL_MS = 60000;
const SESSION_ANOMALY_RECHECK_MS = 10000;
const AUTH_SURFACE_RETRY_AFTER_MS = 220;
const SESSION_ANOMALY_GUARD_TIMEOUT_MS = 180;
const AUTH_CRITICAL_DEGRADED_ROUTE_PREFIXES = [
    "/api/user/me",
    "/api/auth/me",
    "/api/integrations/onboarding",
    "/api/client/status",
    "/api/clients/status",
    "/api/dashboard",
    "/api/billing",
    "/api/clients/oauth/meta/lifecycle",
    "/api/clients/oauth/meta",
    "/api/oauth/meta",
    "/api/oauth/meta/callback",
    "/api/user/api-key",
];
const AUTH_DIRECT_LOOKUP_ROUTE_PREFIXES = [
    "/api/billing",
    "/api/integrations",
    "/api/commerce",
    "/api/ai",
    "/api/help-ai",
    "/api/messages",
    "/api/dashboard",
    "/api/user/workspace",
    "/api/clients/oauth/meta",
    "/api/clients/status",
    "/api/client/status",
];
const SESSION_ANOMALY_SYNC_PATH_PREFIXES = [
    "/api/billing/checkout",
    "/api/security",
    "/api/auth",
    "/api/oauth",
    "/api/commerce",
];
const SESSION_ANOMALY_ASYNC_GUARD_TIMEOUT_MS = 80;
const authContextCache = new LightweightMemoryCache(3000, AUTH_CONTEXT_CACHE_TTL_MS);
const userBusinessCache = new LightweightMemoryCache(2000, 5000);
const businessResolutionCache = new LightweightMemoryCache(2000, 15000);
const authContextInFlight = new Map();
const refreshAuthInFlight = new Map();
const staleAuthContextByUser = new Map();
const recentVerifiedAuthContextByToken = new Map();
const sessionAnomalyCheckedAt = new Map();
const authStats = {
    total: 0,
    memoryHit: 0,
    redisHit: 0,
    dbFallback: 0,
    coalescedWait: 0,
    deniedByBudget: 0,
    staleValidServed: 0,
    degradedServed: 0,
};
let authStatsLastLoggedAt = Date.now();
const hashToken = (token) => crypto_1.default.createHash("sha256").update(token).digest("hex");
const getAuthRedisCacheKey = (tokenKey) => `${AUTH_REDIS_CACHE_PREFIX}${tokenKey}`;
const buildStaleAuthUserKey = (userId, tokenVersion) => `${String(userId || "").trim()}:${Number(tokenVersion || 0)}`;
const writeStaleAuthContext = (context) => {
    const key = buildStaleAuthUserKey(context.userId, context.tokenVersion);
    staleAuthContextByUser.set(key, {
        context: {
            ...context,
        },
        expiresAt: Date.now() + AUTH_STALE_VALID_WINDOW_MS,
    });
};
const readStaleAuthContext = (userId, tokenVersion) => {
    const key = buildStaleAuthUserKey(userId, tokenVersion);
    const cached = staleAuthContextByUser.get(key);
    if (!cached) {
        return null;
    }
    if (cached.expiresAt <= Date.now()) {
        staleAuthContextByUser.delete(key);
        return null;
    }
    return {
        ...cached.context,
    };
};
const asNumber = (value, fallbackValue = 0) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallbackValue;
    }
    return parsed;
};
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const sleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Math.floor(ms)));
});
const randomJitterMs = (maxJitterMs) => Math.floor(Math.random() * Math.max(1, Math.floor(maxJitterMs)));
const markRecentlyVerifiedAuthContext = (tokenKey, context) => {
    if (!tokenKey || !context?.userId) {
        return;
    }
    recentVerifiedAuthContextByToken.set(tokenKey, {
        context: {
            ...context,
        },
        verifiedAt: Date.now(),
        expiresAt: Date.now() + AUTH_RECENT_VERIFICATION_GRACE_MS,
    });
};
const readRecentlyVerifiedAuthContext = (input) => {
    const cached = recentVerifiedAuthContextByToken.get(input.tokenKey);
    if (!cached) {
        return null;
    }
    if (cached.expiresAt <= Date.now()) {
        recentVerifiedAuthContextByToken.delete(input.tokenKey);
        return null;
    }
    const context = cached.context;
    if (context.userId !== input.userId ||
        context.tokenVersion !== input.tokenVersion) {
        return null;
    }
    return {
        ...context,
    };
};
const readSoftStaleAuthContext = (input) => {
    const stale = readStaleAuthContext(input.userId, input.tokenVersion);
    if (!stale) {
        return null;
    }
    if (stale.expiresAt + AUTH_STALE_SOFT_EXPIRATION_MS <= Date.now()) {
        return null;
    }
    return stale;
};
const isDeadlockLikePrismaError = (error) => {
    const code = String(error?.code || "")
        .trim()
        .toUpperCase();
    const message = String(error?.message || "")
        .trim()
        .toLowerCase();
    return (code === "P2034" ||
        message.includes("deadlock") ||
        message.includes("write conflict") ||
        message.includes("tenantisolationledger.upsert"));
};
const getAuthBudgetMs = (req, res) => Math.max(1, Math.min(AUTH_DB_SOFT_BUDGET_MS, (0, requestLifecycle_1.getRequestRemainingMs)({
    req,
    res: res || null,
}, AUTH_DB_SOFT_BUDGET_MS) - 120));
const computeSharedLookupBudgetProfile = (input) => {
    return {
        stage: input.stage,
        timeoutMs: input.maxTimeoutMs || 2000,
        requestBudgetMs: 2000,
        multiplier: 1,
        startupWindowActive: false,
        eventLoopLagMs: 0,
        cpuPressurePercent: 0,
        criticalQueueDepth: 0,
        activeCritical: 0,
        degradedAuthAllowed: input.degradedAuthAllowed,
        cacheAvailability: input.cacheAvailability,
        routeCritical: input.routeCritical,
        reasons: [],
    };
};
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
const runSharedAuthStage = async (input) => {
    const retryAttempts = 1; // 1 bounded retry maximum
    let attempt = 0;
    while (attempt <= retryAttempts) {
        const lookupStartedAt = Date.now();
        try {
            const value = await (0, boundedTimeout_1.withTimeout)({
                label: `auth_shared_${input.stage}`,
                timeoutMs: input.maxTimeoutMs || 2000,
                task: input.task(),
            });
            return value;
        }
        catch (error) {
            const elapsedMs = Date.now() - lookupStartedAt;
            const deadlockLike = isDeadlockLikePrismaError(error);
            const timeoutLike = isAuthStageTimeoutError(error);
            const retryable = deadlockLike || timeoutLike;
            if (!retryable || attempt >= retryAttempts) {
                throw error;
            }
            const retryDelayMs = 50; // tiny backoff window
            await sleep(retryDelayMs);
            attempt += 1;
        }
    }
    throw new Error(`auth_shared_lookup_failed:${input.stage}`);
};
const bumpAuthStats = (update) => {
    authStats.total += Number(update.resolved || 0);
    authStats.memoryHit += Number(update.memoryHit || 0);
    authStats.redisHit += Number(update.redisHit || 0);
    authStats.dbFallback += Number(update.dbFallback || 0);
    authStats.coalescedWait += Number(update.coalescedWait || 0);
    authStats.deniedByBudget += Number(update.deniedByBudget || 0);
    authStats.staleValidServed += Number(update.staleValidServed || 0);
    authStats.degradedServed += Number(update.degradedServed || 0);
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
        staleValidServedRatio: Number((authStats.staleValidServed / total).toFixed(3)),
        degradedServedRatio: Number((authStats.degradedServed / total).toFixed(3)),
        inflightAuthLookups: authContextInFlight.size,
    });
    (0, performanceMetrics_1.emitPerformanceMetric)({
        name: "auth_cache_hit_ratio",
        value: Number((((authStats.memoryHit + authStats.redisHit) / total) * 100).toFixed(2)),
        route: "auth.middleware",
        metadata: {
            total,
            memoryHit: authStats.memoryHit,
            redisHit: authStats.redisHit,
            dbFallback: authStats.dbFallback,
            coalescedWait: authStats.coalescedWait,
            staleValidServed: authStats.staleValidServed,
            degradedServed: authStats.degradedServed,
        },
    });
    authStats.total = 0;
    authStats.memoryHit = 0;
    authStats.redisHit = 0;
    authStats.dbFallback = 0;
    authStats.coalescedWait = 0;
    authStats.deniedByBudget = 0;
    authStats.staleValidServed = 0;
    authStats.degradedServed = 0;
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
    writeStaleAuthContext(cachedContext);
    markRecentlyVerifiedAuthContext(tokenKey, cachedContext);
    return cachedContext;
};
const isValidCachedContext = (context) => {
    if (!context || typeof context !== "object" || Array.isArray(context)) {
        return false;
    }
    const record = context;
    return (typeof record.userId === "string" &&
        typeof record.role === "string" &&
        (record.name === undefined || typeof record.name === "string") &&
        typeof record.tokenVersion === "number" &&
        typeof record.expiresAt === "number");
};
const safeRedisGet = async (key) => {
    try {
        return await Promise.race([
            redis_1.default.get(key),
            new Promise((resolve) => setTimeout(() => resolve(null), 120)),
        ]);
    }
    catch {
        return null;
    }
};
const safeRedisSet = async (key, value, mode, ttl) => {
    try {
        return await Promise.race([
            mode && ttl
                ? redis_1.default.set(key, value, "EX", ttl)
                : redis_1.default.set(key, value),
            new Promise((resolve) => setTimeout(() => resolve(null), 120)),
        ]);
    }
    catch {
        return null;
    }
};
const safeRedisDel = async (key) => {
    try {
        return await Promise.race([
            redis_1.default.del(key),
            new Promise((resolve) => setTimeout(() => resolve(null), 120)),
        ]);
    }
    catch {
        return null;
    }
};
const readRedisAuthContext = async (tokenKey, tokenVersion) => {
    const primaryKey = getAuthRedisCacheKey(tokenKey);
    let cachedRaw = await safeRedisGet(primaryKey).catch(() => null);
    let migrated = false;
    if (!cachedRaw) {
        const fallbackKeys = [
            `auth:session:v1:${tokenKey}`,
            `auth:session:${tokenKey}`
        ];
        for (const fbKey of fallbackKeys) {
            cachedRaw = await safeRedisGet(fbKey).catch(() => null);
            if (cachedRaw) {
                migrated = true;
                break;
            }
        }
    }
    if (!cachedRaw) {
        return null;
    }
    try {
        const parsed = JSON.parse(cachedRaw);
        if (!isValidCachedContext(parsed)) {
            await safeRedisDel(primaryKey).catch(() => undefined);
            return null;
        }
        if (parsed.expiresAt <= Date.now() || parsed.tokenVersion !== tokenVersion) {
            await safeRedisDel(primaryKey).catch(() => undefined);
            return null;
        }
        if (migrated) {
            const remainingTtlSeconds = Math.max(5, Math.ceil((parsed.expiresAt - Date.now()) / 1000));
            await safeRedisSet(primaryKey, cachedRaw, "EX", remainingTtlSeconds).catch(() => undefined);
        }
        authContextCache.set(tokenKey, parsed);
        writeStaleAuthContext(parsed);
        markRecentlyVerifiedAuthContext(tokenKey, parsed);
        return parsed;
    }
    catch {
        await safeRedisDel(primaryKey).catch(() => undefined);
        return null;
    }
};
const writeAuthContextCache = async (tokenKey, context) => {
    authContextCache.set(tokenKey, context);
    writeStaleAuthContext(context);
    markRecentlyVerifiedAuthContext(tokenKey, context);
    await safeRedisSet(getAuthRedisCacheKey(tokenKey), JSON.stringify(context), "EX", AUTH_REDIS_CACHE_TTL_SECONDS).catch(() => undefined);
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
        name: String(input.name || "").trim() || undefined,
        expiresAt: Date.now() + AUTH_SESSION_VALIDITY_MS,
    };
    if (!context.userId || !Number.isFinite(context.tokenVersion)) {
        return;
    }
    authContextCache.set(tokenKey, context);
    writeStaleAuthContext(context);
    markRecentlyVerifiedAuthContext(tokenKey, context);
    void writeAuthContextCache(tokenKey, context);
};
exports.primeAuthContextCacheForToken = primeAuthContextCacheForToken;
const getUserWithBusiness = async (userId) => {
    const cached = userBusinessCache.get(userId);
    if (cached) {
        return cached;
    }
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            role: true,
            isActive: true,
            deletedAt: true,
            tokenVersion: true,
            email: true,
            name: true,
            businessId: true,
        },
    });
    if (user) {
        userBusinessCache.set(userId, user);
    }
    return user;
};
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
    const cacheKey = `${input.userId}:${input.preferredBusinessId || ""}`;
    const cached = businessResolutionCache.get(cacheKey);
    if (cached !== undefined) {
        return cached;
    }
    const identity = await (0, tenant_service_1.resolveUserWorkspaceIdentity)({
        userId: input.userId,
        preferredBusinessId: input.preferredBusinessId || null,
        bootstrapWorkspaceIfMissing: false,
        persistResolvedBusinessId: false,
        isCheckout: input.isCheckout,
    });
    businessResolutionCache.set(cacheKey, identity.businessId);
    return identity.businessId;
};
const isCriticalAuthDegradedRoute = (req) => {
    const route = String(req.originalUrl || req.url || "")
        .trim()
        .toLowerCase();
    const path = String(req.path || "").trim().toLowerCase();
    return AUTH_CRITICAL_DEGRADED_ROUTE_PREFIXES.some((prefix) => route.startsWith(prefix) || path.startsWith(prefix));
};
const isAuthStabilizationCriticalRoute = (req) => {
    const normalized = String(req.originalUrl || req.path || req.url || "")
        .trim()
        .toLowerCase();
    const path = String(req.path || "").trim().toLowerCase();
    const oauthBootstrapRoute = normalized.startsWith("/api/clients/oauth/meta") ||
        normalized.startsWith("/api/oauth/meta") ||
        normalized.startsWith("/api/oauth/meta/callback");
    return (oauthBootstrapRoute ||
        normalized.startsWith("/api/auth") ||
        normalized.startsWith("/api/user/me") ||
        normalized.startsWith("/api/user/workspace") ||
        normalized.startsWith("/api/user/api-key") ||
        normalized.startsWith("/api/integrations/onboarding") ||
        normalized.startsWith("/api/clients/status") ||
        normalized.startsWith("/api/client/status") ||
        path.startsWith("/me") ||
        isCriticalAuthDegradedRoute(req));
};
const shouldUseShallowWorkspaceResolution = (req) => {
    const path = String(req.path || req.originalUrl || req.url || "").trim();
    const surface = String(req.query?.surface || "")
        .trim()
        .toLowerCase();
    return (surface === "auth" ||
        isCriticalAuthDegradedRoute(req) ||
        path.startsWith("/api/user/me") ||
        path.startsWith("/api/auth/me"));
};
const isAuthSurfaceBootstrapRequest = (req) => {
    const surface = String(req.query?.surface || "")
        .trim()
        .toLowerCase();
    if (surface !== "auth" || req.method !== "GET") {
        return false;
    }
    const path = String(req.path || "").trim().toLowerCase();
    if (path === "/me" || path.startsWith("/me/")) {
        return true;
    }
    const route = String(req.originalUrl || req.url || "").trim().toLowerCase();
    return route.includes("/user/me") || route.includes("/auth/me");
};
const shouldServeDegradedAuth = (req) => isAuthSurfaceBootstrapRequest(req) || isCriticalAuthDegradedRoute(req);
const shouldUseDirectAuthLookup = (req) => {
    const route = String(req.originalUrl || req.path || req.url || "")
        .trim()
        .toLowerCase();
    const path = String(req.path || "").trim().toLowerCase();
    if (AUTH_DIRECT_LOOKUP_ROUTE_PREFIXES.some((prefix) => route.startsWith(prefix) || path.startsWith(prefix))) {
        return true;
    }
    return (route.includes("/checkout") ||
        path.includes("/checkout") ||
        route.includes("/onboarding") ||
        path.includes("/onboarding"));
};
const isInstantCheckoutRoute = (req) => {
    const route = String(req.originalUrl || req.path || req.url || "")
        .trim()
        .toLowerCase();
    const path = String(req.path || "").trim().toLowerCase();
    return (route.startsWith("/api/billing/checkout/instant") ||
        path === "/checkout/instant" ||
        path.endsWith("/billing/checkout/instant"));
};
const markDegradedAuthHeaders = (res) => {
    if (!res || res.headersSent || res.writableEnded) {
        return;
    }
    res.setHeader("X-Auth-Processing-State", "PROCESSING");
    res.setHeader("X-Auth-Session-Ready", "0");
    res.setHeader("X-Auth-Retry-After-Ms", String(AUTH_SURFACE_RETRY_AFTER_MS));
    res.setHeader("X-Auth-Degraded", "1");
};
const enforceSessionAnomalyGuard = async (req, input) => {
    if (input.signal?.aborted || (0, requestLifecycle_1.isRequestLifecycleAborted)({ req })) {
        return;
    }
    const sessionKey = getSessionKeyFromRequest(req);
    if (!sessionKey) {
        return;
    }
    if ((0, securityGovernanceOS_service_1.isSessionRevoked)(sessionKey)) {
        throw (0, AppError_1.unauthorized)("Session locked due to anomaly");
    }
    // Defer trackSessionAnomaly to the background for ALL requests
    setImmediate(() => {
        (0, securityGovernanceOS_service_1.trackSessionAnomaly)({
            sessionKey,
            businessId: input.businessId,
            tenantId: input.businessId,
            userId: input.userId,
            ip: getIpAddress(req),
            userAgent: getUserAgent(req),
            deviceId: String(req.headers["x-device-id"] || "").trim() || null,
            signal: null,
        }).catch((err) => {
            req.logger?.warn({ error: err?.message || String(err), sessionKey }, "Background session anomaly tracking failed");
        });
    });
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
const serveDegradedAuthenticatedState = async (input) => {
    bindAuthenticatedContext(input.req, {
        id: input.userId,
        role: input.role,
        email: input.email,
        businessId: input.businessId,
    });
    await runSessionAnomalyGuard(input.req, {
        userId: input.userId,
        businessId: input.businessId,
    });
    if (isRequestClosed(input.req, input.res)) {
        return;
    }
    markDegradedAuthHeaders(input.res);
    if (input.staleContextUsed) {
        bumpAuthStats({
            resolved: 1,
            staleValidServed: 1,
        });
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "stale_valid_auth_served",
            value: 1,
            businessId: input.businessId,
            route: input.req.originalUrl,
            metadata: {
                source: input.source,
                stage: input.stage,
            },
        });
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "auth_stale_context_reused",
            value: 1,
            businessId: input.businessId,
            route: input.req.originalUrl,
            metadata: {
                source: input.source,
                stage: input.stage,
                reason: input.reason,
            },
        });
    }
    bumpAuthStats({
        resolved: 1,
        degradedServed: 1,
    });
    (0, performanceMetrics_1.emitPerformanceMetric)({
        name: "auth_degraded_state_count",
        value: 1,
        businessId: input.businessId,
        route: input.req.originalUrl,
        metadata: {
            source: input.source,
            stage: input.stage,
            reason: input.reason,
            staleContextUsed: input.staleContextUsed,
        },
    });
    (0, performanceMetrics_1.emitPerformanceMetric)({
        name: "false_unauthorized_prevented",
        value: 1,
        businessId: input.businessId,
        route: input.req.originalUrl,
        metadata: {
            source: input.source,
            stage: input.stage,
            reason: input.reason,
            staleContextUsed: input.staleContextUsed,
        },
    });
    (0, performanceMetrics_1.emitPerformanceMetric)({
        name: "auth_processing_state",
        value: Date.now() - input.startedAt,
        businessId: input.businessId,
        route: input.req.originalUrl,
        metadata: {
            surface: isAuthSurfaceBootstrapRequest(input.req) ? "auth" : "critical",
            state: "PROCESSING",
            reason: input.reason,
            stage: input.stage,
            retryAfterMs: AUTH_SURFACE_RETRY_AFTER_MS,
            terminal: false,
            source: input.source,
        },
    });
    (0, performanceMetrics_1.emitPerformanceMetric)({
        name: "auth_verification_stabilized",
        value: Date.now() - input.startedAt,
        businessId: input.businessId,
        route: input.req.originalUrl,
        metadata: {
            source: input.source,
            stage: input.stage,
            reason: input.reason,
            staleContextUsed: input.staleContextUsed,
        },
    });
    (0, performanceMetrics_1.emitPerformanceMetric)({
        name: "auth_cache_recovery_rate",
        value: 1,
        businessId: input.businessId,
        route: input.req.originalUrl,
        metadata: {
            source: input.source,
            stage: input.stage,
            reason: input.reason,
            staleContextUsed: input.staleContextUsed,
        },
    });
    (0, performanceMetrics_1.emitPerformanceMetric)({
        name: "AUTH_MS",
        value: Date.now() - input.startedAt,
        businessId: input.businessId,
        route: input.req.originalUrl,
        metadata: {
            source: `${input.source}_degraded`,
            stage: input.stage,
            staleContextUsed: input.staleContextUsed,
            retryAfterMs: AUTH_SURFACE_RETRY_AFTER_MS,
        },
    });
};
const rotateRefreshToken = async (req, res, userId, oldRefreshToken, tokenVersion) => {
    const newRefreshRaw = (0, generateToken_1.generateRefreshToken)(userId, tokenVersion);
    const oldHashed = hashToken(oldRefreshToken);
    const newHashed = hashToken(newRefreshRaw);
    const ip = getIpAddress(req);
    const userAgent = req.headers["user-agent"] || null;
    await prisma_1.default.refreshToken.create({
        data: {
            token: newHashed,
            userId,
            userAgent,
            ip,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
    });
    const graceKey = `auth:rotated:${oldHashed}`;
    const graceValue = JSON.stringify({ userId, tokenVersion, newHashed });
    await safeRedisSet(graceKey, graceValue, "EX", 60).catch(() => undefined);
    await prisma_1.default.refreshToken.deleteMany({
        where: { token: oldHashed },
    }).catch(() => undefined);
    res.cookie("refreshToken", newRefreshRaw, {
        ...(0, authCookies_1.getAuthCookieOptions)(req),
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return newRefreshRaw;
};
const validateRefreshTokenDbOrGrace = async (hashedToken, userId) => {
    const dbToken = await prisma_1.default.refreshToken.findUnique({
        where: { token: hashedToken },
        select: { userId: true, expiresAt: true },
    }).catch(() => null);
    if (dbToken && dbToken.userId === userId && dbToken.expiresAt.getTime() > Date.now()) {
        return { userId, valid: true };
    }
    const graceValue = await safeRedisGet(`auth:rotated:${hashedToken}`).catch(() => null);
    if (graceValue) {
        try {
            const parsed = JSON.parse(graceValue);
            if (parsed.userId === userId) {
                return { userId, valid: true };
            }
        }
        catch {
            // ignore
        }
    }
    return { userId, valid: false };
};
const protect = async (req, res, next) => {
    const startedAt = Date.now();
    const isCheckout = String(req.originalUrl || "").includes("/checkout") ||
        String(req.originalUrl || "").includes("surface=checkout") ||
        String(req.query?.surface || "").trim().toLowerCase() === "checkout";
    const directLookupRoute = shouldUseDirectAuthLookup(req);
    const degradedAuthAllowed = !directLookupRoute && shouldServeDegradedAuth(req);
    const routeCritical = !directLookupRoute && isAuthStabilizationCriticalRoute(req);
    let decodedAccessToken = null;
    let accessLookupTransientReason = null;
    let accessLookupTransientStage = null;
    const markAccessLookupTransient = (stage, error) => {
        if (!isAuthBudgetExhaustedError(error) && !isAuthStageTimeoutError(error)) {
            return;
        }
        accessLookupTransientStage = stage;
        accessLookupTransientReason =
            String(error?.message || "").trim() ||
                `auth_processing:${stage}`;
    };
    const bindStabilizedAccessContext = async (input) => {
        writeRequestLocalAuthContext(req, input.tokenKey, input.context.tokenVersion, input.context);
        markRecentlyVerifiedAuthContext(input.tokenKey, input.context);
        bindAuthenticatedContext(req, {
            id: input.context.userId,
            role: input.context.role,
            email: input.context.email,
            name: input.context.name,
            businessId: input.context.businessId,
        });
        await runSessionAnomalyGuard(req, {
            userId: input.context.userId,
            businessId: input.context.businessId,
        });
        bumpAuthStats({
            resolved: 1,
            staleValidServed: input.staleContextUsed ? 1 : 0,
        });
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "auth_verification_stabilized",
            value: Date.now() - startedAt,
            businessId: input.context.businessId,
            route: req.originalUrl,
            metadata: {
                source: input.source,
                stage: input.stage,
                reason: input.reason,
            },
        });
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "auth_cache_recovery_rate",
            value: 1,
            businessId: input.context.businessId,
            route: req.originalUrl,
            metadata: {
                source: input.source,
                stage: input.stage,
                reason: input.reason,
            },
        });
        if (input.source === "grace_window") {
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "auth_grace_window_hits",
                value: 1,
                businessId: input.context.businessId,
                route: req.originalUrl,
                metadata: {
                    stage: input.stage,
                    reason: input.reason,
                },
            });
        }
        if (input.staleContextUsed) {
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "auth_stale_context_reused",
                value: 1,
                businessId: input.context.businessId,
                route: req.originalUrl,
                metadata: {
                    source: input.source,
                    stage: input.stage,
                    reason: input.reason,
                },
            });
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "stale_valid_auth_served",
                value: 1,
                businessId: input.context.businessId,
                route: req.originalUrl,
                metadata: {
                    source: input.source,
                    stage: input.stage,
                    reason: input.reason,
                },
            });
        }
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "AUTH_MS",
            value: Date.now() - startedAt,
            businessId: input.context.businessId,
            route: req.originalUrl,
            metadata: {
                source: `access_token_${input.source}`,
                stage: input.stage,
                reason: input.reason,
            },
        });
    };
    try {
        if (isRequestClosed(req, res)) {
            return;
        }
        if (req.user?.id && typeof req.user.role === "string") {
            bindAuthenticatedContext(req, {
                id: req.user.id,
                role: req.user.role,
                email: req.user.email,
                name: req.user.name,
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
        if (isInstantCheckoutRoute(req) && accessToken) {
            const fastPathStartedAt = Date.now();
            const decoded = (0, generateToken_1.verifyAccessToken)(accessToken);
            decodedAccessToken = decoded;
            const accessTokenKey = hashToken(accessToken);
            const maybeContext = decoded?.id && typeof decoded.tokenVersion === "number"
                ? readRequestLocalAuthContext(req, accessTokenKey, decoded.tokenVersion) ||
                    readRecentlyVerifiedAuthContext({
                        tokenKey: accessTokenKey,
                        userId: decoded.id,
                        tokenVersion: decoded.tokenVersion,
                    }) ||
                    readMemoryAuthContext(accessTokenKey, decoded.tokenVersion)
                : null;
            if (maybeContext) {
                writeRequestLocalAuthContext(req, accessTokenKey, maybeContext.tokenVersion, maybeContext);
                markRecentlyVerifiedAuthContext(accessTokenKey, maybeContext);
                bindAuthenticatedContext(req, {
                    id: maybeContext.userId,
                    role: maybeContext.role,
                    email: maybeContext.email,
                    name: maybeContext.name,
                    businessId: maybeContext.businessId,
                });
                await runSessionAnomalyGuard(req, {
                    userId: maybeContext.userId,
                    businessId: maybeContext.businessId,
                });
                bumpAuthStats({
                    resolved: 1,
                    memoryHit: 1,
                });
                const authMs = Date.now() - startedAt;
                if (!res.headersSent && !res.writableEnded) {
                    res.setHeader("X-Checkout-Auth-Ms", String(Math.max(0, Math.floor(authMs))));
                }
                console.info("CHECKOUT_AUTH_FAST_PATH", {
                    requestId: req.requestId || null,
                    route: req.originalUrl,
                    method: req.method,
                    businessId: maybeContext.businessId,
                    userId: maybeContext.userId,
                    authMs,
                    fastPathMs: Date.now() - fastPathStartedAt,
                    source: "memory_session",
                });
                (0, performanceMetrics_1.emitPerformanceMetric)({
                    name: "AUTH_MS",
                    value: authMs,
                    businessId: maybeContext.businessId,
                    route: req.originalUrl,
                    metadata: {
                        source: "checkout_instant_memory_session",
                        inflightAuthLookups: authContextInFlight.size,
                    },
                });
                if (isRequestClosed(req, res)) {
                    return;
                }
                return next();
            }
            console.info("CHECKOUT_AUTH_FALLBACK", {
                requestId: req.requestId || null,
                route: req.originalUrl,
                method: req.method,
                reason: decoded?.id ? "memory_session_miss" : "access_token_invalid",
                elapsedMs: Date.now() - fastPathStartedAt,
            });
        }
        if (directLookupRoute) {
            const lookupStartedAt = Date.now();
            req.logger?.info({
                route: req.originalUrl,
                method: req.method,
                requestId: req.requestId || null,
            }, "auth_lookup_start");
            try {
                let resolvedContext = null;
                let resolvedSource = "access_token";
                if (accessToken) {
                    const decoded = (0, generateToken_1.verifyAccessToken)(accessToken);
                    decodedAccessToken = decoded;
                    if (decoded?.id && typeof decoded.tokenVersion === "number") {
                        const accessUser = await getUserWithBusiness(decoded.id);
                        if (accessUser &&
                            accessUser.isActive &&
                            !accessUser.deletedAt &&
                            accessUser.tokenVersion === decoded.tokenVersion) {
                            resolvedContext = {
                                userId: accessUser.id,
                                role: accessUser.role,
                                email: accessUser.email || undefined,
                                name: accessUser.name || undefined,
                                businessId: String(accessUser.businessId || decoded.businessId || "").trim() || null,
                                tokenVersion: accessUser.tokenVersion,
                                expiresAt: Date.now() + AUTH_SESSION_VALIDITY_MS,
                            };
                        }
                    }
                }
                if (!resolvedContext) {
                    if (!refreshToken) {
                        throw (0, AppError_1.unauthorized)("Session expired");
                    }
                    const decodedRefresh = (0, generateToken_1.verifyRefreshToken)(refreshToken);
                    if (!decodedRefresh?.id || typeof decodedRefresh.tokenVersion !== "number") {
                        (0, authCookies_1.clearAuthCookies)(res, req);
                        throw (0, AppError_1.unauthorized)("Invalid refresh token");
                    }
                    const refreshTokenHash = hashToken(refreshToken);
                    const validation = await validateRefreshTokenDbOrGrace(refreshTokenHash, decodedRefresh.id);
                    if (!validation.valid) {
                        (0, authCookies_1.clearAuthCookies)(res, req);
                        throw (0, AppError_1.unauthorized)("Session expired");
                    }
                    const refreshUser = await getUserWithBusiness(decodedRefresh.id);
                    if (!refreshUser ||
                        !refreshUser.isActive ||
                        refreshUser.deletedAt ||
                        refreshUser.tokenVersion !== decodedRefresh.tokenVersion) {
                        (0, authCookies_1.clearAuthCookies)(res, req);
                        throw (0, AppError_1.unauthorized)("Session expired");
                    }
                    resolvedSource = "refresh_token";
                    resolvedContext = {
                        userId: refreshUser.id,
                        role: refreshUser.role,
                        email: refreshUser.email || undefined,
                        name: refreshUser.name || undefined,
                        businessId: String(refreshUser.businessId || "").trim() || null,
                        tokenVersion: refreshUser.tokenVersion,
                        expiresAt: Date.now() + AUTH_SESSION_VALIDITY_MS,
                    };
                    await rotateRefreshToken(req, res, resolvedContext.userId, refreshToken, resolvedContext.tokenVersion).catch(() => undefined);
                    const newAccessToken = (0, generateToken_1.generateAccessToken)(resolvedContext.userId, resolvedContext.role, resolvedContext.businessId, resolvedContext.tokenVersion);
                    const newTokenKey = hashToken(newAccessToken);
                    res.cookie("accessToken", newAccessToken, {
                        ...(0, authCookies_1.getAuthCookieOptions)(req),
                        maxAge: 15 * 60 * 1000,
                    });
                    writeRequestLocalAuthContext(req, newTokenKey, resolvedContext.tokenVersion, resolvedContext);
                    void writeAuthContextCache(newTokenKey, resolvedContext);
                }
                if (!resolvedContext) {
                    throw (0, AppError_1.unauthorized)("Session expired");
                }
                if (resolvedSource === "access_token" && accessToken) {
                    const accessTokenKey = hashToken(accessToken);
                    writeRequestLocalAuthContext(req, accessTokenKey, resolvedContext.tokenVersion, resolvedContext);
                    markRecentlyVerifiedAuthContext(accessTokenKey, resolvedContext);
                    void writeAuthContextCache(accessTokenKey, resolvedContext);
                }
                bindAuthenticatedContext(req, {
                    id: resolvedContext.userId,
                    role: resolvedContext.role,
                    email: resolvedContext.email,
                    name: resolvedContext.name,
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
                const lookupDurationMs = Date.now() - lookupStartedAt;
                if (isInstantCheckoutRoute(req) && !res.headersSent && !res.writableEnded) {
                    res.setHeader("X-Checkout-Auth-Ms", String(Math.max(0, Math.floor(Date.now() - startedAt))));
                }
                req.logger?.info({
                    route: req.originalUrl,
                    method: req.method,
                    requestId: req.requestId || null,
                    source: resolvedSource,
                    durationMs: lookupDurationMs,
                }, "auth_lookup_success");
                req.logger?.info({
                    route: req.originalUrl,
                    method: req.method,
                    requestId: req.requestId || null,
                    durationMs: lookupDurationMs,
                }, "auth_lookup_duration_ms");
                (0, performanceMetrics_1.emitPerformanceMetric)({
                    name: "AUTH_MS",
                    value: Date.now() - startedAt,
                    businessId: resolvedContext.businessId,
                    route: req.originalUrl,
                    metadata: {
                        source: `direct_${resolvedSource}`,
                    },
                });
                if (isRequestClosed(req, res)) {
                    return;
                }
                return next();
            }
            catch (error) {
                const lookupDurationMs = Date.now() - lookupStartedAt;
                req.logger?.warn({
                    route: req.originalUrl,
                    method: req.method,
                    requestId: req.requestId || null,
                    durationMs: lookupDurationMs,
                    error: error?.message || String(error || "unknown"),
                }, "auth_lookup_failed");
                req.logger?.info({
                    route: req.originalUrl,
                    method: req.method,
                    requestId: req.requestId || null,
                    durationMs: lookupDurationMs,
                }, "auth_lookup_duration_ms");
                if (isAuthNonFatalLookupError(error)) {
                    throw (0, AppError_1.unauthorized)("Session verification failed. Please sign in again.");
                }
                throw error;
            }
        }
        if (accessToken) {
            const decoded = (0, generateToken_1.verifyAccessToken)(accessToken);
            decodedAccessToken = decoded;
            const accessTokenKey = hashToken(accessToken);
            if (decoded?.id && typeof decoded.tokenVersion === "number") {
                const cacheAvailability = authContextCache.has(accessTokenKey) ||
                    Boolean(readRecentlyVerifiedAuthContext({
                        tokenKey: accessTokenKey,
                        userId: decoded.id,
                        tokenVersion: decoded.tokenVersion,
                    })) ||
                    Boolean(readSoftStaleAuthContext({
                        userId: decoded.id,
                        tokenVersion: decoded.tokenVersion,
                    }))
                    ? "warm"
                    : "cold";
                const requestLocalContext = readRequestLocalAuthContext(req, accessTokenKey, decoded.tokenVersion);
                if (requestLocalContext) {
                    bindAuthenticatedContext(req, {
                        id: requestLocalContext.userId,
                        role: requestLocalContext.role,
                        email: requestLocalContext.email,
                        businessId: requestLocalContext.businessId,
                    });
                    markRecentlyVerifiedAuthContext(accessTokenKey, requestLocalContext);
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
                const graceContext = readRecentlyVerifiedAuthContext({
                    tokenKey: accessTokenKey,
                    userId: decoded.id,
                    tokenVersion: decoded.tokenVersion,
                });
                if (graceContext) {
                    await bindStabilizedAccessContext({
                        tokenKey: accessTokenKey,
                        context: graceContext,
                        source: "grace_window",
                        stage: "access_grace_window",
                        reason: "recent_session_verification",
                        staleContextUsed: false,
                    });
                    if (isRequestClosed(req, res)) {
                        return;
                    }
                    return next();
                }
                const localAccessLookupKey = `${accessTokenKey}:${decoded.tokenVersion}`;
                const requestLocalLookup = !isCheckout
                    ? readRequestLocalLookupPromise(req, "access", localAccessLookupKey)
                    : null;
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
                            maxTimeoutMs: AUTH_SHARED_LOOKUP_MAX_TIMEOUT_MS,
                            minBudgetMs: 120,
                            task: () => requestLocalLookup,
                        });
                    }
                    catch (error) {
                        if (!isAuthNonFatalLookupError(error)) {
                            throw error;
                        }
                        markAccessLookupTransient("access_lookup_wait_request_local", error);
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
                        markAccessLookupTransient("access_redis_lookup", error);
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
                        name: redisContext.name,
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
                const existingLookup = !isCheckout
                    ? authContextInFlight.get(accessTokenKey)
                    : null;
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
                    markAccessLookupTransient("access_db_lookup_budget", new Error(`auth_budget_exhausted:access_db_lookup:${getAuthBudgetMs(req, res)}`));
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
                                req,
                                res,
                                stage: "access_user_lookup",
                                maxTimeoutMs: AUTH_USER_STAGE_TIMEOUT_MS,
                                businessId: decoded.businessId || null,
                                degradedAuthAllowed,
                                routeCritical,
                                cacheAvailability,
                                task: () => getUserWithBusiness(decoded.id),
                            });
                            if (!user ||
                                !user.isActive ||
                                user.deletedAt ||
                                user.tokenVersion !== decoded.tokenVersion) {
                                return null;
                            }
                            const businessId = await runSharedAuthStage({
                                req,
                                res,
                                stage: "access_business_lookup",
                                maxTimeoutMs: AUTH_WORKSPACE_STAGE_TIMEOUT_MS,
                                businessId: user?.businessId || decoded.businessId || null,
                                degradedAuthAllowed,
                                routeCritical,
                                cacheAvailability,
                                task: () => resolveBusinessId({
                                    userId: user.id,
                                    userBusinessId: user.businessId || null,
                                    preferredBusinessId: decoded.businessId || null,
                                    allowWorkspaceFallback: !shouldUseShallowWorkspaceResolution(req),
                                    isCheckout,
                                }),
                            });
                            const resolvedContext = {
                                userId: user.id,
                                role: user.role,
                                email: user.email || undefined,
                                name: user.name || undefined,
                                businessId,
                                tokenVersion: user.tokenVersion,
                                expiresAt: Date.now() + AUTH_SESSION_VALIDITY_MS,
                            };
                            void writeAuthContextCache(accessTokenKey, resolvedContext);
                            return resolvedContext;
                        })()
                            .catch((error) => {
                            if (!isAuthNonFatalLookupError(error)) {
                                throw error;
                            }
                            markAccessLookupTransient("access_db_lookup", error);
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
                            maxTimeoutMs: AUTH_SHARED_LOOKUP_MAX_TIMEOUT_MS,
                            minBudgetMs: 120,
                            task: () => lookupPromise,
                        });
                    }
                    catch (error) {
                        if (!isAuthNonFatalLookupError(error)) {
                            throw error;
                        }
                        markAccessLookupTransient("access_lookup_wait", error);
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
                            name: resolvedContext.name,
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
                if (accessLookupTransientReason) {
                    const graceWindowContext = readRecentlyVerifiedAuthContext({
                        tokenKey: accessTokenKey,
                        userId: decoded.id,
                        tokenVersion: decoded.tokenVersion,
                    });
                    if (graceWindowContext) {
                        await bindStabilizedAccessContext({
                            tokenKey: accessTokenKey,
                            context: graceWindowContext,
                            source: "grace_window",
                            stage: accessLookupTransientStage || "access_lookup",
                            reason: accessLookupTransientReason,
                            staleContextUsed: false,
                        });
                        if (isRequestClosed(req, res)) {
                            return;
                        }
                        return next();
                    }
                    const softStaleContext = readSoftStaleAuthContext({
                        userId: decoded.id,
                        tokenVersion: decoded.tokenVersion,
                    });
                    if (softStaleContext && (degradedAuthAllowed || routeCritical)) {
                        await bindStabilizedAccessContext({
                            tokenKey: accessTokenKey,
                            context: softStaleContext,
                            source: "stale_soft",
                            stage: accessLookupTransientStage || "access_lookup",
                            reason: accessLookupTransientReason,
                            staleContextUsed: true,
                        });
                        if (isRequestClosed(req, res)) {
                            return;
                        }
                        return next();
                    }
                }
            }
        }
        if (degradedAuthAllowed &&
            decodedAccessToken?.id &&
            typeof decodedAccessToken.tokenVersion === "number" &&
            accessLookupTransientReason) {
            const staleContext = readSoftStaleAuthContext({
                userId: decodedAccessToken.id,
                tokenVersion: decodedAccessToken.tokenVersion,
            });
            const fallbackBusinessId = String(staleContext?.businessId || decodedAccessToken.businessId || "").trim() ||
                null;
            await serveDegradedAuthenticatedState({
                req,
                res,
                startedAt,
                userId: decodedAccessToken.id,
                role: String(staleContext?.role || decodedAccessToken.role || "").trim() || "AGENT",
                email: staleContext?.email,
                businessId: fallbackBusinessId,
                reason: accessLookupTransientReason,
                stage: accessLookupTransientStage || "access_lookup",
                source: "access_token",
                staleContextUsed: Boolean(staleContext),
            });
            if (isRequestClosed(req, res)) {
                return;
            }
            return next();
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
        const requestLocalRefreshLookup = !isCheckout
            ? readRequestLocalLookupPromise(req, "refresh", refreshLookupKey)
            : null;
        const sharedRefreshLookup = requestLocalRefreshLookup ||
            (!isCheckout ? refreshAuthInFlight.get(refreshLookupKey) : null) ||
            null;
        if (!sharedRefreshLookup && getAuthBudgetMs(req, res) < AUTH_DB_MIN_BUDGET_MS) {
            bumpAuthStats({
                deniedByBudget: 1,
            });
            if (degradedAuthAllowed) {
                const staleContext = readSoftStaleAuthContext({
                    userId: decoded.id,
                    tokenVersion: decoded.tokenVersion,
                });
                if (staleContext) {
                    await serveDegradedAuthenticatedState({
                        req,
                        res,
                        startedAt,
                        userId: staleContext.userId,
                        role: staleContext.role,
                        email: staleContext.email,
                        businessId: staleContext.businessId,
                        reason: "refresh_lookup_budget_exhausted",
                        stage: "refresh_lookup_budget",
                        source: "refresh_token",
                        staleContextUsed: true,
                    });
                    if (isRequestClosed(req, res)) {
                        return;
                    }
                    return next();
                }
            }
            throw (0, AppError_1.unauthorized)("Session verification timed out. Please retry.");
        }
        if (sharedRefreshLookup) {
            bumpAuthStats({
                coalescedWait: 1,
            });
        }
        const refreshLookupPromise = sharedRefreshLookup ||
            (async () => {
                const tokenValidation = await runSharedAuthStage({
                    req,
                    res,
                    stage: "refresh_token_lookup",
                    maxTimeoutMs: AUTH_REFRESH_TOKEN_STAGE_TIMEOUT_MS,
                    businessId: null,
                    degradedAuthAllowed,
                    routeCritical,
                    cacheAvailability: "cold",
                    task: () => validateRefreshTokenDbOrGrace(hashed, decoded.id),
                });
                if (!tokenValidation || !tokenValidation.valid) {
                    return null;
                }
                const user = await runSharedAuthStage({
                    req,
                    res,
                    stage: "refresh_user_lookup",
                    maxTimeoutMs: AUTH_USER_STAGE_TIMEOUT_MS,
                    businessId: null,
                    degradedAuthAllowed,
                    routeCritical,
                    cacheAvailability: "cold",
                    task: () => getUserWithBusiness(decoded.id),
                });
                if (!user ||
                    !user.isActive ||
                    user.deletedAt ||
                    user.tokenVersion !== decoded.tokenVersion) {
                    return null;
                }
                const businessId = await runSharedAuthStage({
                    req,
                    res,
                    stage: "refresh_business_lookup",
                    maxTimeoutMs: AUTH_WORKSPACE_STAGE_TIMEOUT_MS,
                    businessId: user?.businessId || null,
                    degradedAuthAllowed,
                    routeCritical,
                    cacheAvailability: "cold",
                    task: () => resolveBusinessId({
                        userId: user.id,
                        userBusinessId: user.businessId || null,
                        preferredBusinessId: null,
                        allowWorkspaceFallback: !shouldUseShallowWorkspaceResolution(req),
                        isCheckout,
                    }),
                });
                return {
                    userId: user.id,
                    role: user.role,
                    email: user.email || undefined,
                    name: user.name || undefined,
                    businessId,
                    tokenVersion: user.tokenVersion,
                    expiresAt: Date.now() + AUTH_SESSION_VALIDITY_MS,
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
                maxTimeoutMs: AUTH_SHARED_LOOKUP_MAX_TIMEOUT_MS,
                minBudgetMs: AUTH_DB_MIN_BUDGET_MS,
                task: () => refreshLookupPromise,
            });
        }
        catch (error) {
            if (isAuthBudgetExhaustedError(error) ||
                isAuthStageTimeoutError(error)) {
                if (degradedAuthAllowed) {
                    const staleContext = readSoftStaleAuthContext({
                        userId: decoded.id,
                        tokenVersion: decoded.tokenVersion,
                    });
                    if (staleContext) {
                        await serveDegradedAuthenticatedState({
                            req,
                            res,
                            startedAt,
                            userId: staleContext.userId,
                            role: staleContext.role,
                            email: staleContext.email,
                            businessId: staleContext.businessId,
                            reason: String(error?.message || "").trim() ||
                                "refresh_lookup_timeout",
                            stage: "refresh_lookup_wait",
                            source: "refresh_token",
                            staleContextUsed: true,
                        });
                        if (isRequestClosed(req, res)) {
                            return;
                        }
                        return next();
                    }
                }
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
        // Rotate refresh token!
        await rotateRefreshToken(req, res, refreshedContext.userId, refreshToken, refreshedContext.tokenVersion).catch(() => undefined);
        const newAccessToken = (0, generateToken_1.generateAccessToken)(refreshedContext.userId, refreshedContext.role, refreshedContext.businessId, refreshedContext.tokenVersion);
        res.cookie("accessToken", newAccessToken, {
            ...(0, authCookies_1.getAuthCookieOptions)(req),
            maxAge: 15 * 60 * 1000,
        });
        bindAuthenticatedContext(req, {
            id: refreshedContext.userId,
            role: refreshedContext.role,
            email: refreshedContext.email,
            name: refreshedContext.name,
            businessId: refreshedContext.businessId,
        });
        writeRequestLocalAuthContext(req, hashToken(newAccessToken), refreshedContext.tokenVersion, {
            ...refreshedContext,
            expiresAt: Date.now() + AUTH_SESSION_VALIDITY_MS,
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
            name: refreshedContext.name,
            businessId: refreshedContext.businessId,
            tokenVersion: refreshedContext.tokenVersion,
            expiresAt: Date.now() + AUTH_SESSION_VALIDITY_MS,
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
