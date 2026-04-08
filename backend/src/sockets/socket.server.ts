import http from "http";
import { Server } from "socket.io";
import { env } from "../config/env";

let io: Server;

export const initSocket = (server: http.Server) => {
  io = new Server(server, {
    cors: {
      origin: env.ALLOWED_FRONTEND_ORIGINS,
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    socket.on("join_conversation", (leadId: string) => {
      socket.join(`lead_${leadId}`);
    });

    socket.on("typing", (leadId: string) => {
      socket.to(`lead_${leadId}`).emit("typing", leadId);
    });

    socket.on("stop_typing", (leadId: string) => {
      socket.to(`lead_${leadId}`).emit("stop_typing", leadId);
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket not initialized");
  }

  return io;
};
