"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotification = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const socket_server_1 = require("../sockets/socket.server");
const createNotification = async (data) => {
    const { userId, title, message, type } = data;
    const notification = await prisma_1.default.notification.create({
        data: {
            userId,
            title,
            message,
            type, // ✅ REQUIRED
        },
    });
    try {
        const io = (0, socket_server_1.getIO)();
        io.to(`user_${userId}`).emit("new_notification", notification);
    }
    catch (err) {
        console.warn("Socket emit failed", err);
    }
    return notification;
};
exports.createNotification = createNotification;
