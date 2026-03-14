import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app";
import { initSocket } from "./sockets/socket.server";
import prisma from "./config/prisma";

/* WORKERS */
import "./workers/ai.worker";
import "./workers/funnel.worker";

const PORT = process.env.PORT || 5000;

console.log("🚨 THIS IS SYLPH BACKEND 🚨");

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

server.listen(PORT, () => {
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

});

process.on("unhandledRejection", (reason) => {

  console.error("🚨 Unhandled Promise Rejection:", reason);

});