"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitoringMiddleware = void 0;
const monitoringMiddleware = (req, res, next) => {
    const ignoredRoutes = [
        "/webhook",
        "/health",
    ];
    if (ignoredRoutes.some((route) => req.originalUrl.startsWith(route))) {
        return next();
    }
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        console.log(`[MONITOR] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    });
    next();
};
exports.monitoringMiddleware = monitoringMiddleware;
