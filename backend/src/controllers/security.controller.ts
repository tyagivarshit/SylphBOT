import prisma from "../config/prisma";

/* GET ACTIVE SESSIONS */
export const getSessions = async (req: any, res: any) => {
  try {
    const userId = req.user.id;

    const sessions = await prisma.refreshToken.findMany({
      where: { userId },
      select: {
        id: true,
        userAgent: true,
        ip: true,
        createdAt: true,
      },
    });

    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
};

/* LOGOUT OTHER DEVICES */
export const logoutAllSessions = async (req: any, res: any) => {
  try {
    const userId = req.user.id;

    await prisma.refreshToken.deleteMany({
      where: { userId },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
};