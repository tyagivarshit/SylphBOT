import prisma from "../config/prisma";
import { getIO } from "../sockets/socket.server";

type CreateNotificationInput = {
  userId: string;
  title?: string;
  message: string;
  type: string; // ✅ ADD THIS
};

export const createNotification = async (
  data: CreateNotificationInput
) => {

  const { userId, title, message, type } = data;

  const notification = await prisma.notification.create({
    data: {
      userId,
      title,
      message,
      type, // ✅ REQUIRED
    },
  });

  try {
    const io = getIO();
    io.to(`user_${userId}`).emit("new_notification", notification);
  } catch (err) {
    console.warn("Socket emit failed", err);
  }

  return notification;
};