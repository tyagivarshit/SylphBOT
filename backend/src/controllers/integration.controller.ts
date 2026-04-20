import prisma from "../config/prisma";
import { getOnboardingSnapshot } from "../services/onboarding.service";

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

export const getOnboarding = async (req: any, res: any) => {
  try {
    const businessId = req.user?.businessId;

    if (!businessId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const onboarding = await getOnboardingSnapshot(businessId);

    return res.json({
      success: true,
      data: onboarding,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch onboarding",
    });
  }
};
