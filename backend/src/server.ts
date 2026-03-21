import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app";
import { initSocket } from "./sockets/socket.server";
import prisma from "./config/prisma";

/* PASSPORT */
import passport from "passport";
import { configurePassport } from "./config/passport";

/* MONITORING */
import * as Sentry from "@sentry/node";

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

configurePassport();
app.use(passport.initialize());

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
  } catch (err) {
    console.error("❌ Cron failed to start:", err);
  }
}

const PORT = process.env.PORT || 5000;

/* ======================================
CREATE SERVER
====================================== */

const server = http.createServer(app);

/* ======================================
SOCKET
====================================== */

initSocket(server);

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
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("🛑 Shutting down server...");

  try {
    server.close(async () => {
      await prisma.$disconnect();
      console.log("✅ Server closed");
      process.exit(0);
    });

    /* force exit if hanging */
    setTimeout(() => {
      console.error("❌ Force shutdown");
      process.exit(1);
    }, 10000);

  } catch (error) {
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