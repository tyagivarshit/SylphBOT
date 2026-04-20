import type { Notification, Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { getIO } from "../sockets/socket.server";

type CreateNotificationInput = {
  userId: string;
  businessId?: string;
  title?: string;
  message: string;
  type: string;
  link?: string;
};

const createNotificationRecord = async (
  client: Prisma.TransactionClient | typeof prisma,
  data: CreateNotificationInput
) => {
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

export const emitNotification = (notification: Notification) => {
  try {
    const io = getIO();
    io.to(`user_${notification.userId}`).emit("new_notification", notification);
  } catch (err) {
    console.warn("Socket emit failed", err);
  }
};

export const createNotificationTx = async (
  tx: Prisma.TransactionClient,
  data: CreateNotificationInput
) => createNotificationRecord(tx, data);

export const createNotification = async (data: CreateNotificationInput) => {
  const notification = await createNotificationRecord(prisma, data);
  emitNotification(notification);
  return notification;
};
