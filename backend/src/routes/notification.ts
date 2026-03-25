import express from "express";
import prisma from "../config/prisma";

const router = express.Router();

// 🔥 GET NOTIFICATIONS
router.get("/", async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  res.json(notifications);
});

// 🔥 MARK SINGLE READ
router.patch("/:id/read", async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { id } = req.params;

  await prisma.notification.update({
    where: { id },
    data: { read: true },
  });

  res.json({ success: true });
});

// 🔥 MARK ALL READ
router.patch("/read-all", async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });

  res.json({ success: true });
});

export default router;