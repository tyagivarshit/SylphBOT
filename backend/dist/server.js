"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = void 0;
const http_1 = __importDefault(require("http"));
const app_1 = __importDefault(require("./app"));
const passport_1 = require("./config/passport");
const env_1 = require("./config/env");
const socket_server_1 = require("./sockets/socket.server");
const logger_1 = __importDefault(require("./utils/logger"));
const sentry_1 = require("./observability/sentry");
const lifecycle_1 = require("./runtime/lifecycle");
let isShuttingDown = false;
const startServer = async () => {
    (0, sentry_1.initializeSentry)();
    (0, passport_1.configurePassport)();
    (0, lifecycle_1.initRedis)();
    (0, lifecycle_1.initQueues)();
    if (process.env.ENABLE_CRON === "true") {
        (0, lifecycle_1.initCrons)();
    }
    const server = http_1.default.createServer(app_1.default);
    (0, socket_server_1.initSocket)(server);
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
    server.requestTimeout = 15000;
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
