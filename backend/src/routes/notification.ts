import express from "express";
import prisma from "../config/prisma";
import { getIO } from "../sockets/socket.server";
import { protect } from "../middleware/auth.middleware";

const router = express.Router();

/* ======================================================
🔥 APPLY AUTH TO ALL ROUTES
====================================================== */
router.use(protect);

/* ======================================================
🔥 GET NOTIFICATIONS + UNREAD COUNT
====================================================== */
router.get("/", async (req, res) => {
  const userId = req.user?.id;

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.notification.count({
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

  let settings = await prisma.notificationSettings.findUnique({
    where: { userId },
  });

  // 👉 first time create default settings
  if (!settings) {
    settings = await prisma.notificationSettings.create({
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

  const updated = await prisma.notificationSettings.upsert({
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

  const notification = await prisma.notification.findFirst({
    where: { id, userId },
  });

  if (!notification) {
    return res.status(404).json({ error: "Notification not found" });
  }

  await prisma.notification.update({
    where: { id },
    data: { read: true },
  });

  // 🔥 realtime update
  try {
    const io = getIO();
    io.to(`user_${userId}`).emit("notification_read", { id });
  } catch {}

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

  await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });

  // 🔥 realtime update
  try {
    const io = getIO();
    io.to(`user_${userId}`).emit("notifications_cleared");
  } catch {}

  res.json({
    success: true,
    data: {
      userId,
    },
  });
});

export default router;
