import { Request, Response } from "express";
import prisma from "../config/prisma";
import { encrypt } from "../utils/encrypt";

interface CustomRequest extends Request {
  user?: {
    id?: string;
    userId?: string;
    role?: string;
  };
  params: {
    id: string;
  };
}

/*
---------------------------------------------------
3️⃣1️⃣ CREATE CLIENT
---------------------------------------------------
*/
export const createClient = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { platform, accessToken, aiTone, businessInfo, pricingInfo } =
      req.body;

    if (!platform || !accessToken) {
      return res
        .status(400)
        .json({ message: "Platform and accessToken required" });
    }

    const business = await prisma.business.findFirst({
      where: { ownerId: userId },
    });

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    // 🔐 SUBSCRIPTION FETCH
    const subscription = await prisma.subscription.findUnique({
      where: { businessId: business.id },
    });

    if (!subscription) {
      return res
        .status(400)
        .json({ message: "No active subscription found" });
    }

    let allowedPlatforms: string[] = [];

    // 🟢 FREE PLAN (7-Day BOTH Trial)
    if (subscription.plan === "FREE") {
      const now = new Date();

      if (
        subscription.currentPeriodEnd &&
        now < subscription.currentPeriodEnd
      ) {
        // Trial active → allow both
        allowedPlatforms = ["WHATSAPP", "INSTAGRAM"];
      } else {
        return res.status(403).json({
          message:
            "Your 7-day trial has expired. Please upgrade your plan.",
        });
      }
    }

    // 🟢 WHATSAPP ONLY
    else if (subscription.plan === "WHATSAPP_ONLY") {
      allowedPlatforms = ["WHATSAPP"];
    }

    // 🟢 INSTAGRAM ONLY
    else if (subscription.plan === "INSTAGRAM_ONLY") {
      allowedPlatforms = ["INSTAGRAM"];
    }

    // 🟢 BOTH
    else if (subscription.plan === "BOTH") {
      allowedPlatforms = ["WHATSAPP", "INSTAGRAM"];
    }

    // ❌ Unknown plan safety
    else {
      return res.status(403).json({
        message: "Invalid subscription plan",
      });
    }

    if (!allowedPlatforms.includes(platform)) {
      return res.status(403).json({
        message: `Your current plan does not allow ${platform} integration`,
      });
    }

    const encryptedToken = encrypt(accessToken);

    const client = await prisma.client.create({
      data: {
        businessId: business.id,
        platform,
        accessToken: encryptedToken,
        aiTone,
        businessInfo,
        pricingInfo,
        isActive: true,
      },
    });

    return res.status(201).json({
      message: "Client created successfully",
      client,
    });
  } catch (error: any) {
    if (error.code === "P2002") {
      return res.status(400).json({
        message: "This platform already exists for your business",
      });
    }

    return res.status(500).json({
      message: "Client creation failed",
      error: error.message,
    });
  }
};
/*
---------------------------------------------------
3️⃣3️⃣ FETCH CLIENTS
---------------------------------------------------
*/
export const getClients = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    console.log("USER ID:", userId);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const business = await prisma.business.findFirst({
      where: { ownerId: userId },
    });
    console.log("BUSINESS:", business);

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const clients = await prisma.client.findMany({
      where: {
        businessId: business.id,
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(clients);
  } catch (error: any) {
    return res.status(500).json({
      message: "Fetch failed",
      error: error.message,
    });
  }
};

/*
---------------------------------------------------
3️⃣2️⃣ UPDATE CLIENT
---------------------------------------------------
*/
export const updateClient = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params;
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({ message: "Access token required" });
    }

    const business = await prisma.business.findFirst({
      where: { ownerId: userId },
    });

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const client = await prisma.client.findFirst({
      where: {
        id,
        businessId: business.id,
        isActive: true,
      },
    });

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const encryptedToken = encrypt(accessToken);

    const updated = await prisma.client.update({
      where: { id: client.id },
      data: { accessToken: encryptedToken },
    });

    return res.json({
      message: "Client updated successfully",
      updated,
    });
  } catch (error: any) {
    console.error("Update error:", error);
    return res.status(500).json({
      message: "Update failed",
      error: error.message,
    });
  }
};

/*
---------------------------------------------------
3️⃣4️⃣ SOFT DELETE
---------------------------------------------------
*/
export const deleteClient = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params;

    const business = await prisma.business.findFirst({
      where: { ownerId: userId },
    });

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const client = await prisma.client.findFirst({
      where: {
        id,
        businessId: business.id,
        isActive: true,
      },
    });

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    await prisma.client.update({
      where: { id: client.id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });

    return res.json({ message: "Client deleted successfully" });
  } catch (error: any) {
    console.error("Delete error:", error);
    return res.status(500).json({
      message: "Delete failed",
      error: error.message,
    });
  }
};
export const getSingleClient = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params;

    const business = await prisma.business.findFirst({
      where: { ownerId: userId },
    });

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const client = await prisma.client.findFirst({
      where: {
        id,
        businessId: business.id,
        isActive: true,
      },
    });

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    return res.json(client);
  } catch (error: any) {
    return res.status(500).json({
      message: "Fetch failed",
      error: error.message,
    });
  }
};