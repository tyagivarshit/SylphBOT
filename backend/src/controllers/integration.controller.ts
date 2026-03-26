import prisma from "../config/prisma";

/* GET CONNECTIONS */
export const getIntegrations = async (req: any, res: any) => {
  try {
    const businessId = req.user.businessId;

    const clients = await prisma.client.findMany({
      where: { businessId },
      select: {
        id: true,
        platform: true,
        isActive: true,
      },
    });

    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
};