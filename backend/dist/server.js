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
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const http_1 = __importDefault(require("http"));
const app_1 = __importDefault(require("./app"));
const socket_server_1 = require("./sockets/socket.server");
const prisma_1 = __importDefault(require("./config/prisma"));
/* PASSPORT */
const passport_1 = __importDefault(require("passport"));
const passport_2 = require("./config/passport");
/* MONITORING */
const Sentry = __importStar(require("@sentry/node"));
/* ======================================
SENTRY INIT (FULL INTEGRATION)
====================================== */
Sentry.init({
    dsn: process.env.SENTRY_DSN || "",
    tracesSampleRate: 1.0,
});
/* ======================================
PASSPORT INIT
====================================== */
(0, passport_2.configurePassport)();
app_1.default.use(passport_1.default.initialize());
/* ======================================
WORKERS (CONTROLLED LOAD)
====================================== */
if (process.env.ENABLE_WORKERS === "true") {
    require("./workers/ai.worker");
    require("./workers/funnel.worker");
}
/* ======================================
CRON (SINGLE INSTANCE SAFE)
====================================== */
if (process.env.ENABLE_CRON === "true") {
    try {
        require("./cron/cron.runner");
        console.log("🧹 Cron runner started");
    }
    catch (err) {
        console.error("❌ Cron failed to start:", err);
    }
}
const PORT = process.env.PORT || 5000;
/* ======================================
CREATE SERVER
====================================== */
const server = http_1.default.createServer(app_1.default);
/* ======================================
SOCKET
====================================== */
(0, socket_server_1.initSocket)(server);
/* ======================================
START SERVER
====================================== */
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
/* ======================================
GRACEFUL SHUTDOWN (SAFE)
====================================== */
let isShuttingDown = false;
const shutdown = async () => {
    if (isShuttingDown)
        return;
    isShuttingDown = true;
    console.log("🛑 Shutting down server...");
    try {
        server.close(async () => {
            await prisma_1.default.$disconnect();
            console.log("✅ Server closed");
            process.exit(0);
        });
        /* force exit if hanging */
        setTimeout(() => {
            console.error("❌ Force shutdown");
            process.exit(1);
        }, 10000);
    }
    catch (error) {
        console.error("Shutdown error:", error);
        Sentry.captureException(error);
        process.exit(1);
    }
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
/* ======================================
GLOBAL ERROR HANDLING
====================================== */
process.on("uncaughtException", (err) => {
    console.error("🚨 Uncaught Exception:", err);
    Sentry.captureException(err);
});
process.on("unhandledRejection", (reason) => {
    console.error("🚨 Unhandled Promise Rejection:", reason);
    Sentry.captureException(reason);
});
