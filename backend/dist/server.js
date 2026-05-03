"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = void 0;
const http_1 = __importDefault(require("http"));
const passport_1 = require("./config/passport");
const env_1 = require("./config/env");
const socket_server_1 = require("./sockets/socket.server");
const logger_1 = __importDefault(require("./utils/logger"));
const sentry_1 = require("./observability/sentry");
const stripeConfig_service_1 = require("./services/commerce/providers/stripeConfig.service");
const billingSettlement_service_1 = require("./services/billingSettlement.service");
const lifecycle_1 = require("./runtime/lifecycle");
const commerceProjection_service_1 = require("./services/commerceProjection.service");
let isShuttingDown = false;
const startServer = async () => {
    (0, sentry_1.initializeSentry)();
    (0, passport_1.configurePassport)();
    await (0, stripeConfig_service_1.emitStripeConfigValidation)();
    await (0, lifecycle_1.initQueues)();
    const coldBootReplay = await commerceProjection_service_1.commerceProjectionService
        .replayPendingProviderWebhooks({
        provider: "STRIPE",
        businessId: null,
        limit: 100,
        includeClaimedOlderThanMinutes: 5,
    })
        .catch(() => null);
    const entitlementReplay = await (0, billingSettlement_service_1.reconcilePendingEntitlementSync)({
        limit: 100,
    }).catch(() => null);
    if (coldBootReplay) {
        logger_1.default.info({ coldBootReplay }, "Commerce cold boot replay completed");
    }
    if (entitlementReplay && entitlementReplay.pending > 0) {
        logger_1.default.info({ entitlementReplay }, "Commerce entitlement reconcile replay completed");
    }
    (0, lifecycle_1.initWorkers)({
        authEmail: true,
    });
    if (process.env.ENABLE_CRON === "true") {
        (0, lifecycle_1.initCrons)();
    }
    const { default: app } = await Promise.resolve().then(() => __importStar(require("./app")));
    const server = http_1.default.createServer(app);
    (0, socket_server_1.initSocket)(server);
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
    server.requestTimeout = 9000;
    const shutdownServer = async (signal, exitCode = 0) => {
        if (isShuttingDown) {
            return;
        }
        isShuttingDown = true;
        logger_1.default.info({ signal }, "Server shutdown started");
        try {
            await new Promise((resolve, reject) => {
                server.close((error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
        }
        catch (error) {
            logger_1.default.error({
                err: error,
                signal,
            }, "Server close failed during shutdown");
        }
        await (0, lifecycle_1.shutdown)();
        process.exit(exitCode);
    };
    process.on("SIGINT", () => {
        void shutdownServer("SIGINT");
    });
    process.on("SIGTERM", () => {
        void shutdownServer("SIGTERM");
    });
    process.on("uncaughtException", (error) => {
        logger_1.default.error({ err: error }, "Server uncaught exception");
        (0, sentry_1.captureExceptionWithContext)(error, {
            tags: {
                layer: "server",
                event: "uncaughtException",
            },
        });
        void shutdownServer("uncaughtException", 1);
    });
    process.on("unhandledRejection", (error) => {
        logger_1.default.error({
            err: error,
        }, "Server unhandled rejection");
        (0, sentry_1.captureExceptionWithContext)(error, {
            tags: {
                layer: "server",
                event: "unhandledRejection",
            },
        });
    });
    return await new Promise((resolve) => {
        server.listen(env_1.env.PORT, () => {
            logger_1.default.info({ port: env_1.env.PORT }, "Server listening");
            resolve(server);
        });
    });
};
exports.startServer = startServer;
if (require.main === module) {
    void (0, exports.startServer)();
}
