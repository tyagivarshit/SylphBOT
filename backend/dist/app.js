"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const passport_1 = __importDefault(require("passport"));
const env_1 = require("./config/env");
const auth_middleware_1 = require("./middleware/auth.middleware");
const subscription_middleware_1 = require("./middleware/subscription.middleware");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const googleAuth_routes_1 = __importDefault(require("./routes/googleAuth.routes"));
const client_routes_1 = __importDefault(require("./routes/client.routes"));
const ai_routes_1 = __importDefault(require("./routes/ai.routes"));
const whatsapp_webhook_1 = __importDefault(require("./routes/whatsapp.webhook"));
const instagram_webhook_1 = __importDefault(require("./routes/instagram.webhook"));
const billing_routes_1 = __importDefault(require("./routes/billing.routes"));
const stripeWebhook_routes_1 = __importDefault(require("./routes/stripeWebhook.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const commentTrigger_routes_1 = __importDefault(require("./routes/commentTrigger.routes"));
const message_routes_1 = __importDefault(require("./routes/message.routes"));
const automation_routes_1 = __importDefault(require("./routes/automation.routes"));
const instagram_routes_1 = __importDefault(require("./routes/instagram.routes"));
const knowledge_routes_1 = __importDefault(require("./routes/knowledge.routes"));
const training_routes_1 = __importDefault(require("./routes/training.routes"));
const lead_routes_1 = __importDefault(require("./routes/lead.routes"));
const analytics_routes_1 = __importDefault(require("./routes/analytics.routes"));
const autonomous_routes_1 = __importDefault(require("./routes/autonomous.routes"));
const search_routes_1 = __importDefault(require("./routes/search.routes"));
const notification_1 = __importDefault(require("./routes/notification"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const security_routes_1 = __importDefault(require("./routes/security.routes"));
const audit_routes_1 = __importDefault(require("./routes/audit.routes"));
const integration_routes_1 = __importDefault(require("./routes/integration.routes"));
const oauth_routes_1 = __importDefault(require("./routes/oauth.routes"));
const booking_routes_1 = __importDefault(require("./routes/booking.routes"));
const availability_routes_1 = __importDefault(require("./routes/availability.routes"));
const conversation_routes_1 = __importDefault(require("./routes/conversation.routes"));
const health_routes_1 = __importDefault(require("./routes/health.routes"));
const receptionIntake_routes_1 = __importDefault(require("./routes/receptionIntake.routes"));
const usage_routes_1 = __importDefault(require("./routes/usage.routes"));
const client_controller_1 = require("./controllers/client.controller");
const helpAi_routes_1 = __importDefault(require("./routes/helpAi.routes"));
const ai_queue_1 = require("./queues/ai.queue");
const runtimePolicy_service_1 = require("./services/runtimePolicy.service");
const rateLimit_middleware_1 = require("./middleware/rateLimit.middleware");
const monitoring_middleware_1 = require("./middleware/monitoring.middleware");
const requestContext_middleware_1 = require("./middleware/requestContext.middleware");
const apiKey_middleware_1 = require("./middleware/apiKey.middleware");
const rbac_service_1 = require("./services/rbac.service");
const AppError_1 = require("./utils/AppError");
const asyncHandler_1 = require("./utils/asyncHandler");
const sentry_1 = require("./observability/sentry");
const app = (0, express_1.default)();
const isPlainRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const normalizeJsonResponseBody = (body, statusCode) => {
    const success = statusCode < 400;
    if (body === undefined) {
        return {
            success,
            data: null,
        };
    }
    if (!isPlainRecord(body)) {
        return {
            success,
            data: body,
        };
    }
    const hasSuccess = typeof body.success === "boolean";
    const hasData = Object.prototype.hasOwnProperty.call(body, "data");
    if (hasSuccess && hasData) {
        return body;
    }
    if (!success) {
        return {
            ...body,
            success: false,
            data: hasData ? (body.data ?? null) : null,
        };
    }
    const { success: _ignoredSuccess, ...rest } = body;
    return {
        ...rest,
        success: hasSuccess ? Boolean(body.success) : true,
        data: hasData ? (body.data ?? null) : Object.keys(rest).length ? rest : null,
    };
};
app.set("trust proxy", 1);
app.disable("x-powered-by");
const allowedOrigins = new Set(env_1.env.ALLOWED_FRONTEND_ORIGINS);
const TRUSTED_SITE_SUFFIX = "automexiaai.in";
const sameSiteOrigins = new Set();
const addSameSiteOrigins = (origin) => {
    if (!origin) {
        return;
    }
    try {
        const url = new URL(origin);
        const hostname = url.hostname.toLowerCase();
        if (hostname !== TRUSTED_SITE_SUFFIX &&
            !hostname.endsWith(`.${TRUSTED_SITE_SUFFIX}`)) {
            return;
        }
        for (const candidate of [
            TRUSTED_SITE_SUFFIX,
            `www.${TRUSTED_SITE_SUFFIX}`,
            `app.${TRUSTED_SITE_SUFFIX}`,
        ]) {
            sameSiteOrigins.add(`${url.protocol}//${candidate}`);
        }
    }
    catch {
        // Ignore invalid origins here because env validation already handles them.
    }
};
const isAllowedOrigin = (origin) => {
    const normalizedOrigin = new URL(origin).origin;
    if (allowedOrigins.has(normalizedOrigin)) {
        return true;
    }
    return sameSiteOrigins.has(normalizedOrigin);
};
addSameSiteOrigins(env_1.env.FRONTEND_ORIGIN);
addSameSiteOrigins(env_1.env.BACKEND_ORIGIN);
const corsOptions = {
    origin(origin, callback) {
        if (!origin) {
            return callback(null, true);
        }
        try {
            const normalizedOrigin = new URL(origin).origin;
            if (isAllowedOrigin(normalizedOrigin)) {
                return callback(null, true);
            }
        }
        catch {
            return callback(new Error("Invalid CORS origin"));
        }
        console.warn("Blocked CORS origin", { origin });
        return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Api-Key",
        "Cache-Control",
        "Stripe-Signature",
        "X-Requested-With",
        "X-Request-Id",
        "Sentry-Trace",
        "Baggage",
    ],
    exposedHeaders: ["X-Request-Id"],
    maxAge: 86400,
};
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: {
        policy: "strict-origin-when-cross-origin",
    },
    hsts: env_1.env.IS_PROD
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
        }
        : false,
}));
app.use(requestContext_middleware_1.requestContextMiddleware);
app.use((0, compression_1.default)());
app.use((0, cors_1.default)(corsOptions));
app.options(/.*/, (0, cors_1.default)(corsOptions));
app.use(rateLimit_middleware_1.globalLimiter);
app.use((0, cookie_parser_1.default)());
app.use(passport_1.default.initialize());
app.use((req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = ((body) => originalJson(normalizeJsonResponseBody(body, res.statusCode)));
    next();
});
app.use(monitoring_middleware_1.monitoringMiddleware);
app.use((req, res, next) => {
    res.setTimeout(15000, () => {
        req.logger?.error({
            statusCode: 408,
        }, "Request timeout");
        if (!res.headersSent) {
            res.status(408).json({
                success: false,
                message: "Request Timeout",
                requestId: req.requestId,
            });
        }
    });
    next();
});
app.use("/api/webhooks/stripe", express_1.default.raw({ type: "application/json" }), stripeWebhook_routes_1.default);
app.use("/api/webhook/whatsapp", express_1.default.raw({ type: "application/json" }), whatsapp_webhook_1.default);
app.use("/api/webhook/instagram", express_1.default.raw({
    type: "application/json",
    verify: (req, _res, buf) => {
        req.rawBody = buf;
    },
}), instagram_webhook_1.default);
app.use("/webhook/instagram", express_1.default.raw({
    type: "application/json",
    verify: (req, _res, buf) => {
        req.rawBody = buf;
    },
}), instagram_webhook_1.default);
app.use(express_1.default.json({ limit: "1mb" }));
const normalizeIncomingMessage = (raw) => {
    const message = String(raw.message || "").trim();
    const businessId = String(raw.businessId || "").trim();
    const leadId = String(raw.leadId || "").trim();
    if (!message || !businessId || !leadId) {
        throw new Error("businessId, leadId, and message are required");
    }
    return {
        businessId,
        leadId,
        message,
        kind: raw.kind || "router",
        plan: raw.plan,
        platform: raw.platform,
        senderId: raw.senderId,
        pageId: raw.pageId,
        phoneNumberId: raw.phoneNumberId,
        accessTokenEncrypted: raw.accessTokenEncrypted,
        externalEventId: raw.externalEventId?.trim(),
        idempotencyKey: raw.idempotencyKey?.trim(),
        metadata: raw.metadata,
        skipInboundPersist: raw.skipInboundPersist ?? false,
        retryCount: raw.retryCount ?? 0,
    };
};
const extractMessages = (body) => {
    const payload = Array.isArray(body.messages) ? body.messages : [body];
    if (!payload.length) {
        throw new Error("messages array is required");
    }
    if (payload.length > env_1.env.AI_API_MAX_BATCH_SIZE) {
        throw new Error(`messages array exceeds limit of ${env_1.env.AI_API_MAX_BATCH_SIZE}`);
    }
    return payload.map(normalizeIncomingMessage);
};
app.get("/", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    res.json({
        success: true,
        message: "API Running",
        environment: env_1.env.NODE_ENV,
        queue: ai_queue_1.AI_QUEUE_NAME,
    });
}));
app.post("/v1/messages", apiKey_middleware_1.optionalApiKeyAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    let timeoutHandle;
    try {
        if (!(0, runtimePolicy_service_1.isPhase5APreviewBypassEnabled)()) {
            return res.status(410).json({
                success: false,
                requestId: req.requestId,
                message: "Direct AI enqueue is disabled in production. Use the canonical reception intake runtime.",
            });
        }
        const body = (req.body || {});
        const messages = extractMessages(body);
        if (req.apiKey) {
            if (!(0, rbac_service_1.hasPermission)({ permissions: req.apiKey.permissions }, "messages:enqueue")) {
                return res.status(403).json({
                    success: false,
                    requestId: req.requestId,
                    message: "API key does not have permission to enqueue messages",
                });
            }
            const crossTenantMessage = messages.find((message) => message.businessId !== req.apiKey.businessId);
            if (crossTenantMessage) {
                return res.status(403).json({
                    success: false,
                    requestId: req.requestId,
                    message: "Cross-tenant message enqueue is not allowed",
                });
            }
        }
        const enqueue = (0, ai_queue_1.enqueueAIBatch)(messages, {
            source: "api",
            idempotencyKey: typeof body.idempotencyKey === "string"
                ? body.idempotencyKey.trim()
                : undefined,
        });
        const timeout = new Promise((_resolve, reject) => {
            timeoutHandle = setTimeout(() => {
                reject(new Error("Queue enqueue timeout"));
            }, env_1.env.API_REQUEST_TIMEOUT_MS);
        });
        const jobs = await Promise.race([enqueue, timeout]);
        res.status(202).json({
            success: true,
            requestId: req.requestId,
            queue: ai_queue_1.AI_QUEUE_NAME,
            accepted: messages.length,
            jobs: jobs.length,
        });
    }
    catch (error) {
        const message = String(error?.message || "Unable to enqueue messages");
        const statusCode = /timeout/i.test(message) ? 503 : 400;
        res.status(statusCode).json({
            success: false,
            requestId: req.requestId,
            message,
        });
    }
    finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
}));
app.use("/api/auth", auth_routes_1.default);
app.use("/api/auth", googleAuth_routes_1.default);
app.use("/api/dashboard", auth_middleware_1.protect, dashboard_routes_1.default);
app.use("/api/billing", auth_middleware_1.protect, billing_routes_1.default);
app.use("/api/usage", auth_middleware_1.protect, usage_routes_1.default);
app.use("/api/help-ai", auth_middleware_1.protect, helpAi_routes_1.default);
app.use("/api/user", auth_middleware_1.protect, user_routes_1.default);
app.use("/api/notifications", auth_middleware_1.protect, notification_1.default);
app.use("/api/ai", auth_middleware_1.protect, subscription_middleware_1.attachBillingContext, rateLimit_middleware_1.aiLimiter, ai_routes_1.default);
app.use("/api/automation", auth_middleware_1.protect, subscription_middleware_1.attachBillingContext, automation_routes_1.default);
app.use("/api/messages", auth_middleware_1.protect, subscription_middleware_1.attachBillingContext, message_routes_1.default);
app.use("/api/conversations", auth_middleware_1.protect, conversation_routes_1.default);
app.use("/api/comment-triggers", auth_middleware_1.protect, subscription_middleware_1.attachBillingContext, commentTrigger_routes_1.default);
app.use("/api/comment-automation/triggers", auth_middleware_1.protect, subscription_middleware_1.attachBillingContext, commentTrigger_routes_1.default);
app.use("/api/triggers", auth_middleware_1.protect, subscription_middleware_1.attachBillingContext, commentTrigger_routes_1.default);
app.get("/api/client/status", auth_middleware_1.protect, client_controller_1.getClientStatus);
app.use("/api/clients", auth_middleware_1.protect, client_routes_1.default);
app.use("/api/instagram", auth_middleware_1.protect, instagram_routes_1.default);
app.use("/api/knowledge", auth_middleware_1.protect, knowledge_routes_1.default);
app.use("/api/training", auth_middleware_1.protect, training_routes_1.default);
app.use("/api/leads", auth_middleware_1.protect, lead_routes_1.default);
app.use("/api/analytics", auth_middleware_1.protect, analytics_routes_1.default);
app.use("/api/autonomous", auth_middleware_1.protect, autonomous_routes_1.default);
app.use("/api/audit", auth_middleware_1.protect, audit_routes_1.default);
app.use("/api/search", auth_middleware_1.protect, search_routes_1.default);
app.use("/api/security", auth_middleware_1.protect, security_routes_1.default);
app.use("/api/integrations", auth_middleware_1.protect, integration_routes_1.default);
app.use("/api/oauth", auth_middleware_1.protect, oauth_routes_1.default);
app.use("/api/booking", auth_middleware_1.protect, subscription_middleware_1.attachBillingContext, booking_routes_1.default);
app.use("/api/availability", auth_middleware_1.protect, subscription_middleware_1.attachBillingContext, availability_routes_1.default);
app.use("/api/inbox/intake", auth_middleware_1.protect, receptionIntake_routes_1.default);
app.use("/api/health", health_routes_1.default);
app.get("/health", (req, res) => {
    res.status(200).json({
        success: true,
        status: "ok",
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
    });
});
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found",
        requestId: req.requestId,
    });
});
app.use((err, req, res, _next) => {
    req.logger?.error({
        error: err,
        path: req.originalUrl,
        method: req.method,
    }, "Unhandled request error");
    (0, sentry_1.captureExceptionWithContext)(err, {
        tags: {
            layer: "express",
        },
        extras: {
            path: req.originalUrl,
            method: req.method,
        },
    });
    if ((0, AppError_1.isAppError)(err)) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            code: err.code,
            details: err.details || null,
            requestId: req.requestId,
        });
    }
    return res.status(500).json({
        success: false,
        message: env_1.env.IS_PROD ? "Internal server error" : err.message,
        requestId: req.requestId,
    });
});
exports.default = app;
