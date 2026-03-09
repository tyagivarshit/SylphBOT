import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app";
import { initSocket } from "./sockets/socket.server";

const PORT = process.env.PORT || 5000;

console.log("🚨 THIS IS SYLPH BACKEND 🚨");

/* ============================= */
/* CREATE HTTP SERVER */
/* ============================= */

const server = http.createServer(app);

/* ============================= */
/* INIT SOCKET */
/* ============================= */

initSocket(server);

/* ============================= */
/* START SERVER */
/* ============================= */

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});