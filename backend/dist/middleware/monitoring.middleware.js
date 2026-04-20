"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitoringMiddleware = void 0;
const sentry_1 = require("../observability/sentry");
const tenant_service_1 = require("../services/tenant.service");
const monitoringMiddleware = (req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
        req.logger?.info({
            statusCode: res.statusCode,
            durationMs: Date.now() - startedAt,
            method: req.method,
            ip: req.ip,
            userId: req.user?.id || null,
            businessId: (0, tenant_service_1.getRequestBusinessId)(req),
        }, "Request completed");
        if (res.statusCode >= 500) {
            (0, sentry_1.captureExceptionWithContext)(new Error(`Request failed with status ${res.statusCode}`), {
                tags: {
                    layer: "monitoring",
                    statusCode: res.statusCode,
                },
                extras: {
                    path: req.originalUrl,
                    method: req.method,
                    businessId: (0, tenant_service_1.getRequestBusinessId)(req),
                    requestId: req.requestId,
                },
            });
        }
    });
    next();
};
exports.monitoringMiddleware = monitoringMiddleware;
