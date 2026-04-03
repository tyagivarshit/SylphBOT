import prisma from "../config/prisma";

/* ======================================================
SAVE MESSAGE (REAL-TIME CHAT ENGINE)
====================================================== */

export const handleIncomingMessage = async ({
  leadId,
  content,
  sender = "USER",
  io,
}: {
  leadId: string;
  content: string;
  sender?: "USER" | "AI";
  io?: any;
}) => {
  try {
    if (!leadId || !content) return null;

    /* ======================================================
    SAVE MESSAGE
    ====================================================== */

    const message = await prisma.message.create({
      data: {
        leadId: String(leadId),
        content,
        sender,
      },
    });

    /* ======================================================
    GET LEAD
    ====================================================== */

    const lead = await prisma.lead.findUnique({
      where: { id: String(leadId) },
    });

    if (!lead) return message;

    /* ======================================================
    UPDATE LEAD (LAST MESSAGE + UNREAD COUNT)
    ====================================================== */

    await prisma.lead.update({
      where: { id: String(leadId) },
      data: {
        lastMessageAt: new Date(),

        // 🔥 unread logic (only for incoming messages)
        unreadCount:
          sender === "USER"
            ? (lead.unreadCount || 0) + 1
            : lead.unreadCount || 0,
      },
    });

    /* ======================================================
    SOCKET EMIT (REAL-TIME)
    ====================================================== */

    io?.to(leadId).emit("new_message", message);

    return message;

  } catch (error) {
    console.error("Message service error:", error);
    return null;
  }
};

/* ======================================================
FETCH MESSAGES (OPEN CHAT)
====================================================== */

export const getMessages = async (leadId: string) => {
  if (!leadId) return [];

  return prisma.message.findMany({
    where: { leadId: String(leadId) },
    orderBy: { createdAt: "asc" },
  });
};

/* ======================================================
MARK AS READ (WHEN CHAT OPEN)
====================================================== */

export const markLeadAsRead = async (leadId: string) => {
  if (!leadId) return;

  return prisma.lead.update({
    where: { id: String(leadId) },
    data: {
      unreadCount: 0,
    },
  });
};