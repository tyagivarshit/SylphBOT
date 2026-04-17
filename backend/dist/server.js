"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const app_1 = __importDefault(require("./app"));
const prisma_1 = __importDefault(require("./config/prisma"));
const env_1 = require("./config/env");
const redis_1 = require("./config/redis");
const ai_queue_1 = require("./queues/ai.queue");
const socket_server_1 = require("./sockets/socket.server");
const server = http_1.default.createServer(app_1.default);
(0, socket_server_1.initSocket)(server);
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 15000;
let isShuttingDown = false;
const shutdown = async (signal) => {
    if (isShuttingDown) {
        return;
    }
    isShuttingDown = true;
    await new Promise((resolve) => {
        server.close(() => resolve());
    });
    await Promise.allSettled([
        prisma_1.default.$disconnect(),
        (0, ai_queue_1.closeAIQueue)(),
        (0, redis_1.closeRedisConnection)(),
    ]);
    if (signal === "uncaughtException") {
        process.exit(1);
    }
    process.exit(0);
};
process.on("SIGINT", () => {
    void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
});
process.on("uncaughtException", (error) => {
    console.error(`[server] ${String(error.message || error)}`);
    void shutdown("uncaughtException");
});
process.on("unhandledRejection", (error) => {
    console.error(`[server] ${String(error?.message || error)}`);
});
server.listen(env_1.env.PORT, () => {
    console.log(`[server] listening on ${env_1.env.PORT}`);
});
