"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIO = exports.initSocket = void 0;
const socket_io_1 = require("socket.io");
const env_1 = require("../config/env");
let io;
const initSocket = (server) => {
    io = new socket_io_1.Server(server, {
        cors: {
            origin: env_1.env.ALLOWED_FRONTEND_ORIGINS,
            credentials: true,
        },
    });
    io.on("connection", (socket) => {
        console.log("Socket connected:", socket.id);
        socket.on("join_conversation", (leadId) => {
            socket.join(`lead_${leadId}`);
        });
        socket.on("typing", (leadId) => {
            socket.to(`lead_${leadId}`).emit("typing", leadId);
        });
        socket.on("stop_typing", (leadId) => {
            socket.to(`lead_${leadId}`).emit("stop_typing", leadId);
        });
        socket.on("disconnect", () => {
            console.log("Socket disconnected:", socket.id);
        });
    });
};
exports.initSocket = initSocket;
const getIO = () => {
    if (!io) {
        throw new Error("Socket not initialized");
    }
    return io;
};
exports.getIO = getIO;
