"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const prisma_1 = __importDefault(require("../config/prisma"));
const socket_server_1 = require("../sockets/socket.server");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
/* ======================================================
🔥 APPLY AUTH TO ALL ROUTES
====================================================== */
router.use(auth_middleware_1.protect);
/* ======================================================
🔥 GET NOTIFICATIONS + UNREAD COUNT
====================================================== */
router.get("/", async (req, res) => {
    const userId = req.user?.id;
    const [notifications, unreadCount] = await Promise.all([
        prisma_1.default.notification.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: 20,
        }),
        prisma_1.default.notification.count({
            where: { userId, read: false },
        }),
    ]);
    res.json({
        success: true,
        data: {
            notifications,
            unreadCount,
        },
    });
});
/* ======================================================
🔥 GET NOTIFICATION SETTINGS
====================================================== */
router.get("/settings", async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    let settings = await prisma_1.default.notificationSettings.findUnique({
        where: { userId },
    });
    // 👉 first time create default settings
    if (!settings) {
        settings = await prisma_1.default.notificationSettings.create({
            data: { userId },
        });
    }
    res.json({
        success: true,
        data: settings,
    });
});
/* ======================================================
🔥 UPDATE NOTIFICATION SETTINGS
====================================================== */
router.patch("/settings", async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const { email, whatsapp, leads } = req.body;
    const updated = await prisma_1.default.notificationSettings.upsert({
        where: { userId },
        update: { email, whatsapp, leads },
        create: { userId, email, whatsapp, leads },
    });
    res.json({
        success: true,
        data: updated,
    });
});
/* ======================================================
🔥 MARK SINGLE READ (SECURE)
====================================================== */
router.patch("/:id/read", async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;
    const notification = await prisma_1.default.notification.findFirst({
        where: { id, userId },
    });
    if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
    }
    await prisma_1.default.notification.update({
        where: { id },
        data: { read: true },
    });
    // 🔥 realtime update
    try {
        const io = (0, socket_server_1.getIO)();
        io.to(`user_${userId}`).emit("notification_read", { id });
    }
    catch { }
    res.json({
        success: true,
        data: {
            id,
        },
    });
});
/* ======================================================
🔥 MARK ALL READ
====================================================== */
router.patch("/read-all", async (req, res) => {
    const userId = req.user?.id;
    await prisma_1.default.notification.updateMany({
        where: { userId, read: false },
        data: { read: true },
    });
    // 🔥 realtime update
    try {
        const io = (0, socket_server_1.getIO)();
        io.to(`user_${userId}`).emit("notifications_cleared");
    }
    catch { }
    res.json({
        success: true,
        data: {
            userId,
        },
    });
});
exports.default = router;
