"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const crypto_1 = require("crypto");
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
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
const search_routes_1 = __importDefault(require("./routes/search.routes"));
const notification_1 = __importDefault(require("./routes/notification"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const security_routes_1 = __importDefault(require("./routes/security.routes"));
const integration_routes_1 = __importDefault(require("./routes/integration.routes"));
const oauth_routes_1 = __importDefault(require("./routes/oauth.routes"));
const booking_routes_1 = __importDefault(require("./routes/booking.routes"));
const availability_routes_1 = __importDefault(require("./routes/availability.routes"));
const conversation_routes_1 = __importDefault(require("./routes/conversation.routes"));
const rateLimit_middleware_1 = require("./middleware/rateLimit.middleware");
const monitoring_middleware_1 = require("./middleware/monitoring.middleware");
const trial_cron_1 = require("./cron/trial.cron");
const metaTokenRefresh_cron_1 = require("./cron/metaTokenRefresh.cron");
const resetUsage_cron_1 = require("./cron/resetUsage.cron");
require("./workers/bookingReminder.worker");
const AppError_1 = require("./utils/AppError");
const app = (0, express_1.default)();
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
        "Stripe-Signature",
        "X-Requested-With",
        "X-Request-Id",
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
app.use((0, compression_1.default)());
app.use((0, cors_1.default)(corsOptions));
app.options(/.*/, (0, cors_1.default)(corsOptions));
app.use(rateLimit_middleware_1.globalLimiter);
app.use((0, cookie_parser_1.default)());
app.use((req, res, next) => {
    const headerValue = req.headers["x-request-id"];
    const requestId = (Array.isArray(headerValue) ? headerValue[0] : headerValue) ||
        (0, crypto_1.randomUUID)();
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    next();
});
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        console.info(JSON.stringify({
            requestId: req.requestId,
            type: "request",
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration: Date.now() - start,
            ip: req.ip,
        }));
    });
    next();
});
app.use(monitoring_middleware_1.monitoringMiddleware);
app.use((req, res, next) => {
    res.setTimeout(15000, () => {
        console.error("Request timeout:", req.originalUrl);
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
app.use(express_1.default.json({ limit: "1mb" }));
app.get("/", (_req, res) => {
    res.json({
        success: true,
        message: "API Running",
        environment: env_1.env.NODE_ENV,
    });
});
app.use("/api/auth", auth_routes_1.default);
app.use("/api/auth", googleAuth_routes_1.default);
app.use("/api/dashboard", auth_middleware_1.protect, dashboard_routes_1.default);
app.use("/api/billing", auth_middleware_1.protect, billing_routes_1.default);
app.use("/api/user", auth_middleware_1.protect, user_routes_1.default);
app.use("/api/notifications", auth_middleware_1.protect, notification_1.default);
app.use("/api/ai", auth_middleware_1.protect, subscription_middleware_1.attachBillingContext, rateLimit_middleware_1.aiLimiter, ai_routes_1.default);
app.use("/api/automation", auth_middleware_1.protect, subscription_middleware_1.attachBillingContext, automation_routes_1.default);
app.use("/api/messages", auth_middleware_1.protect, subscription_middleware_1.attachBillingContext, message_routes_1.default);
app.use("/api/conversations", auth_middleware_1.protect, conversation_routes_1.default);
app.use("/api/comment-triggers", auth_middleware_1.protect, subscription_middleware_1.attachBillingContext, commentTrigger_routes_1.default);
app.use("/api/clients", auth_middleware_1.protect, client_routes_1.default);
app.use("/api/instagram", auth_middleware_1.protect, instagram_routes_1.default);
app.use("/api/knowledge", auth_middleware_1.protect, knowledge_routes_1.default);
app.use("/api/training", auth_middleware_1.protect, training_routes_1.default);
app.use("/api/leads", auth_middleware_1.protect, lead_routes_1.default);
app.use("/api/analytics", auth_middleware_1.protect, analytics_routes_1.default);
app.use("/api/search", auth_middleware_1.protect, search_routes_1.default);
app.use("/api/security", auth_middleware_1.protect, security_routes_1.default);
app.use("/api/integrations", auth_middleware_1.protect, integration_routes_1.default);
app.use("/api/oauth", auth_middleware_1.protect, oauth_routes_1.default);
app.use("/api/booking", auth_middleware_1.protect, subscription_middleware_1.attachBillingContext, booking_routes_1.default);
app.use("/api/availability", auth_middleware_1.protect, subscription_middleware_1.attachBillingContext, availability_routes_1.default);
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
    console.error("ERROR:", {
        requestId: req.requestId,
        message: err.message,
        path: req.originalUrl,
        method: req.method,
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
if (process.env.ENABLE_CRON === "true") {
    (0, trial_cron_1.startTrialExpiryCron)();
    (0, metaTokenRefresh_cron_1.startMetaTokenRefreshCron)();
    (0, resetUsage_cron_1.startUsageResetCron)();
}
process.on("uncaughtException", (err) => {
    console.error("UNCAUGHT EXCEPTION:", err);
});
process.on("unhandledRejection", (err) => {
    console.error("UNHANDLED REJECTION:", err);
});
exports.default = app;
