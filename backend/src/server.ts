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

/* WORKERS */
import "./workers/ai.worker";
import "./workers/funnel.worker";

const PORT = process.env.PORT || 5000;

console.log("🚨 THIS IS SYLPH BACKEND 🚨");

/* ============================= */
/* SENTRY INIT (MONITORING) */
/* ============================= */

Sentry.init({
  dsn: process.env.SENTRY_DSN || "",
  tracesSampleRate: 1.0,
});

/* ============================= */
/* PASSPORT INIT */
/* ============================= */

configurePassport();
app.use(passport.initialize());

/* ============================= */
/* CREATE SERVER */
/* ============================= */

const server = http.createServer(app);

/* ============================= */
/* SOCKET */
/* ============================= */

initSocket(server);

/* ============================= */
/* START SERVER */
/* ============================= */

server.listen(PORT, async () => {

  console.log(`🚀 Server running on port ${PORT}`);

});

/* ============================= */
/* GRACEFUL SHUTDOWN */
/* ============================= */

const shutdown = async () => {

  console.log("🛑 Shutting down server...");

  try {

    await prisma.$disconnect();

    server.close(() => {
      console.log("✅ Server closed");
      process.exit(0);
    });

  } catch (error) {

    console.error("Shutdown error:", error);
    Sentry.captureException(error);
    process.exit(1);

  }

};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

/* ============================= */
/* GLOBAL ERROR HANDLING */
/* ============================= */

process.on("uncaughtException", (err) => {

  console.error("🚨 Uncaught Exception:", err);
  Sentry.captureException(err);

});

process.on("unhandledRejection", (reason) => {

  console.error("🚨 Unhandled Promise Rejection:", reason);
  Sentry.captureException(reason);

});