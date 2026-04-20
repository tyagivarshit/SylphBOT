"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotification = exports.createNotificationTx = exports.emitNotification = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const socket_server_1 = require("../sockets/socket.server");
const createNotificationRecord = async (client, data) => {
    const { userId, businessId, title, message, type, link } = data;
    return client.notification.create({
        data: {
            userId,
            businessId,
            title,
            message,
            type,
            link,
        },
    });
};
const emitNotification = (notification) => {
    try {
        const io = (0, socket_server_1.getIO)();
        io.to(`user_${notification.userId}`).emit("new_notification", notification);
    }
    catch (err) {
        console.warn("Socket emit failed", err);
    }
};
exports.emitNotification = emitNotification;
const createNotificationTx = async (tx, data) => createNotificationRecord(tx, data);
exports.createNotificationTx = createNotificationTx;
const createNotification = async (data) => {
    const notification = await createNotificationRecord(prisma_1.default, data);
    (0, exports.emitNotification)(notification);
    return notification;
};
exports.createNotification = createNotification;
