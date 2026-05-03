"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitoringMiddleware = void 0;
const sentry_1 = require("../observability/sentry");
const performanceMetrics_1 = require("../observability/performanceMetrics");
const reliabilityOS_service_1 = require("../services/reliability/reliabilityOS.service");
const tenant_service_1 = require("../services/tenant.service");
const monitoring_config_1 = require("../config/monitoring.config");
const monitoringMiddleware = (req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
        const businessId = (0, tenant_service_1.getRequestBusinessId)(req);
        const traceId = req.requestId || null;
        const statusCode = res.statusCode;
        const durationMs = Date.now() - startedAt;
        req.logger?.info({
            statusCode,
            durationMs,
            method: req.method,
            ip: req.ip,
            userId: req.user?.id || null,
            businessId,
        }, "Request completed");
        void (0, reliabilityOS_service_1.recordTraceLedger)({
            traceId,
            correlationId: traceId,
            businessId,
            tenantId: businessId,
            leadId: typeof req.query?.leadId === "string"
                ? req.query.leadId
                : null,
            stage: `http:${req.method}:${req.originalUrl}`,
            status: statusCode >= 500 ? "FAILED" : "COMPLETED",
            endedAt: new Date(),
            metadata: {
                statusCode,
                durationMs,
            },
        }).catch(() => undefined);
        void (0, reliabilityOS_service_1.recordObservabilityEvent)({
            businessId,
            tenantId: businessId,
            eventType: "http.request.completed",
            message: `${req.method} ${req.originalUrl} -> ${statusCode}`,
            severity: statusCode >= 500
                ? "error"
                : statusCode >= 400
                    ? "warn"
                    : "info",
            context: {
                traceId,
                correlationId: traceId,
                tenantId: businessId,
                component: "http",
                phase: "reception",
            },
            metadata: {
                statusCode,
                durationMs,
                method: req.method,
                route: req.originalUrl,
            },
        }).catch(() => undefined);
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "API_MS",
            value: durationMs,
            businessId,
            route: req.originalUrl,
            metadata: {
                method: req.method,
                statusCode,
            },
        });
        if (durationMs >= monitoring_config_1.monitoringConfig.slowRequestMs) {
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "DB_SLOW",
                value: durationMs,
                businessId,
                route: req.originalUrl,
                metadata: {
                    method: req.method,
                    statusCode,
                    thresholdMs: monitoring_config_1.monitoringConfig.slowRequestMs,
                },
            });
        }
        if (statusCode >= 500) {
            (0, sentry_1.captureExceptionWithContext)(new Error(`Request failed with status ${statusCode}`), {
                tags: {
                    layer: "monitoring",
                    statusCode,
                },
                extras: {
                    path: req.originalUrl,
                    method: req.method,
                    businessId,
                    requestId: req.requestId,
                },
            });
        }
    });
    next();
};
exports.monitoringMiddleware = monitoringMiddleware;
