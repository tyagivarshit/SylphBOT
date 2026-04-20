import { Request, Response } from "express";
import prisma from "../config/prisma";
import { upsertClientByUniqueKey } from "../services/clientUpsert.service";
import { encrypt } from "../utils/encrypt";
import axios from "axios";
import { getPlanKey } from "../config/plan.config";
import { resolvePlanContext } from "../services/feature.service";
import { triggerOnboardingDemo } from "../services/onboarding.service";

/*
---------------------------------------------------
HELPER FUNCTIONS
---------------------------------------------------
*/

const getBusinessByOwner = async (userId: string) => {
  return prisma.business.findFirst({
    where: { ownerId: userId },
    select: { id: true },
  });
};

const getSubscription = async (businessId: string) => {
  return prisma.subscription.findUnique({
    where: { businessId },
    include: { plan: true },
  });
};

const getAllowedPlatforms = async (
  businessId: string,
  subscription: Awaited<ReturnType<typeof getSubscription>>
) => {
  if (!subscription?.plan) {
    return [];
  }

  const planContext = await resolvePlanContext(businessId).catch(() => null);

  if (!planContext || planContext.state !== "ACTIVE") {
    return [];
  }

  const planKey = getPlanKey(subscription.plan);

  if (planKey === "PRO" || planKey === "ELITE") {
    return ["WHATSAPP", "INSTAGRAM"];
  }

  if (planKey === "BASIC") {
    return ["INSTAGRAM"];
  }

  return [];
};

const queueOnboardingDemoForClient = async (
  businessId: string,
  client: { id: string; platform: string; isActive?: boolean | null }
) => {
  try {
    await triggerOnboardingDemo({
      businessId,
      client: {
        id: client.id,
        platform: client.platform,
        isActive: client.isActive ?? true,
      },
    });
  } catch (error) {
    console.error("Onboarding demo trigger failed:", error);
  }
};

/*
---------------------------------------------------
CREATE CLIENT
---------------------------------------------------
*/

export const createClient = async (req: Request, res: Response) => {
  try {

    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let {
      platform,
      phoneNumberId,
      pageId,
      accessToken,
      aiTone,
      businessInfo,
      pricingInfo,

      /* NEW AI TRAINING FIELDS */
      faqKnowledge,
      salesInstructions

    } = req.body;

    if (!platform || !accessToken) {
      return res.status(400).json({
        message: "platform and accessToken required",
      });
    }

    platform = platform.toUpperCase();

    const business = await getBusinessByOwner(userId);

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const subscription = await getSubscription(business.id);

    if (!subscription) {
      return res.status(403).json({
        message: "No active subscription found",
      });
    }

    const allowedPlatforms = await getAllowedPlatforms(
      business.id,
      subscription
    );

    if (!allowedPlatforms.length) {
      return res.status(403).json({
        message: "Your current plan does not allow new integrations",
      });
    }

    if (!allowedPlatforms.includes(platform)) {
      return res.status(403).json({
        message: `${platform} integration not allowed in your plan`,
      });
    }

    const encryptedToken = encrypt(accessToken);

    const client = await upsertClientByUniqueKey({
      businessId: business.id,
      platform,
      phoneNumberId,
      pageId,
      accessToken: encryptedToken,
      aiTone,
      businessInfo,
      pricingInfo,
      faqKnowledge,
      salesInstructions,
    });

    await queueOnboardingDemoForClient(business.id, client);

    return res.status(201).json({
      message: "Client created successfully",
      client,
    });

  } catch (error: any) {

    if (error.code === "CLIENT_UNIQUE_KEY_REQUIRED") {
      return res.status(400).json({
        message: "phoneNumberId or pageId required",
      });
    }

    if (error.code === "CLIENT_OWNERSHIP_CONFLICT") {
      return res.status(400).json({
        message: "This connected account already exists for another business",
      });
    }

    if (error.code === "CLIENT_DUPLICATE_KEY_CONFLICT") {
      return res.status(400).json({
        message: "This connected account already exists for your business",
      });
    }

    if (error.code === "P2002") {
      return res.status(400).json({
        message: "This connected account already exists for your business",
      });
    }

    console.error("Create client error:", error);

    return res.status(500).json({
      message: "Client creation failed",
    });

  }
};

/*
---------------------------------------------------
META OAUTH CONNECT (INSTAGRAM)
---------------------------------------------------
*/

export const metaOAuthConnect = async (req: Request, res: Response) => {

  try {

    const userId = (req as any).user?.id;

    const {
      code,
      aiTone,
      businessInfo,
      pricingInfo,

      /* NEW */
      faqKnowledge,
      salesInstructions

    } = req.body;

    if (!userId || !code) {
      return res.status(400).json({
        message: "Invalid request",
      });
    }

    const business = await getBusinessByOwner(userId);

    if (!business) {
      return res.status(404).json({
        message: "Business not found",
      });
    }

    const subscription = await getSubscription(business.id);

    if (!subscription) {
      return res.status(403).json({
        message: "No active subscription found",
      });
    }

    const allowedPlatforms = await getAllowedPlatforms(
      business.id,
      subscription
    );

    if (!allowedPlatforms.includes("INSTAGRAM")) {
      return res.status(403).json({
        message: "Instagram integration not allowed in your plan",
      });
    }

    const shortTokenRes = await axios.get(
      "https://graph.facebook.com/v19.0/oauth/access_token",
      {
        params: {
          client_id: process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          redirect_uri: `${process.env.BACKEND_URL}/api/oauth/meta/callback`,
          code,
        },
      }
    );

    const shortToken = shortTokenRes.data.access_token;

    const longTokenRes = await axios.get(
      "https://graph.facebook.com/v19.0/oauth/access_token",
      {
        params: {
          grant_type: "fb_exchange_token",
          client_id: process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          fb_exchange_token: shortToken,
        },
      }
    );

    const longToken = longTokenRes.data.access_token;

    const pagesRes = await axios.get(
      "https://graph.facebook.com/v19.0/me/accounts",
      {
        params: {
          access_token: longToken,
        },
      }
    );

    const page = pagesRes.data.data?.[0];

    if (!page) {
      return res.status(400).json({
        message: "No Facebook page found",
      });
    }

    const igRes = await axios.get(
      `https://graph.facebook.com/v19.0/${page.id}`,
      {
        params: {
          fields: "instagram_business_account",
          access_token: page.access_token,
        },
      }
    );

    const instagramId = igRes.data.instagram_business_account?.id;

    if (!instagramId) {
      return res.status(400).json({
        message: "Instagram business account not connected to this page",
      });
    }

    const encryptedToken = encrypt(page.access_token);

    const client = await upsertClientByUniqueKey({
      businessId: business.id,
      platform: "INSTAGRAM",
      pageId: instagramId,
      accessToken: encryptedToken,
      aiTone,
      businessInfo,
      pricingInfo,
      faqKnowledge,
      salesInstructions,
    });

    await queueOnboardingDemoForClient(business.id, client);

    return res.json({
      message: "Instagram connected successfully",
      client,
    });

  } catch (error: any) {

    if (error.code === "CLIENT_UNIQUE_KEY_REQUIRED") {
      return res.status(400).json({
        message: "phoneNumberId or pageId required",
      });
    }

    if (error.code === "CLIENT_OWNERSHIP_CONFLICT") {
      return res.status(400).json({
        message: "This connected account already exists for another business",
      });
    }

    if (error.code === "CLIENT_DUPLICATE_KEY_CONFLICT") {
      return res.status(400).json({
        message: "This connected account already exists for your business",
      });
    }

    if (error.code === "P2002") {
      return res.status(400).json({
        message: "This connected account already exists for your business",
      });
    }

    console.error("Meta OAuth error:", error);

    return res.status(500).json({
      message: "Instagram connection failed",
    });

  }

};

/*
---------------------------------------------------
AI TRAINING UPDATE
---------------------------------------------------
*/

export const updateAITraining = async (req: Request, res: Response) => {

  try {

    const userId = (req as any).user?.id;
    const id = req.params.id as string;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      businessInfo,
      pricingInfo,
      aiTone,
      faqKnowledge,
      salesInstructions
    } = req.body;

    const business = await getBusinessByOwner(userId);

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const client = await prisma.client.findFirst({
      where: {
        id,
        businessId: business.id,
        isActive: true
      }
    });

    if (!client) {
      return res.status(404).json({
        message: "Client not found"
      });
    }

    const updatedClient = await prisma.client.update({
      where: { id },
      data: {
        businessInfo,
        pricingInfo,
        aiTone,
        faqKnowledge,
        salesInstructions
      }
    });

    return res.json({
      message: "AI training updated successfully",
      client: updatedClient
    });

  } catch (error) {

    console.error("AI training update error:", error);

    return res.status(500).json({
      message: "AI training update failed"
    });

  }

};

/*
---------------------------------------------------
FETCH CLIENTS
---------------------------------------------------
*/

export const getClients = async (req: Request, res: Response) => {

  try {

    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const business = await getBusinessByOwner(userId);

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const clients = await prisma.client.findMany({
      where: {
        businessId: business.id,
        isActive: true,
        platform: {
          not: "SYSTEM",
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(clients);

  } catch (error: any) {

    console.error("Fetch clients error:", error);

    return res.status(500).json({
      message: "Fetch failed",
    });

  }

};

/*
---------------------------------------------------
UPDATE CLIENT
---------------------------------------------------
*/

export const updateClient = async (req: Request, res: Response) => {

  try {

    const userId = (req as any).user?.id;
    const id = req.params.id as string;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        message: "Access token required",
      });
    }

    const business = await getBusinessByOwner(userId);

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const client = await prisma.client.findFirst({
      where: {
        id,
        businessId: business.id,
        isActive: true,
      },
      select: { id: true },
    });

    if (!client) {
      return res.status(404).json({
        message: "Client not found",
      });
    }

    const encryptedToken = encrypt(accessToken);

    await prisma.client.update({
      where: { id },
      data: { accessToken: encryptedToken },
    });

    return res.json({
      message: "Client updated successfully",
    });

  } catch (error: any) {

    console.error("Update client error:", error);

    return res.status(500).json({
      message: "Update failed",
    });

  }

};

/*
---------------------------------------------------
DELETE CLIENT
---------------------------------------------------
*/

export const deleteClient = async (req: Request, res: Response) => {

  try {

    const userId = (req as any).user?.id;
    const id = req.params.id as string;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const business = await getBusinessByOwner(userId);

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const client = await prisma.client.findFirst({
      where: {
        id,
        businessId: business.id,
        isActive: true,
      },
      select: { id: true },
    });

    if (!client) {
      return res.status(404).json({
        message: "Client not found",
      });
    }

    await prisma.client.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });

    return res.json({
      message: "Client deleted successfully",
    });

  } catch (error: any) {

    console.error("Delete client error:", error);

    return res.status(500).json({
      message: "Delete failed",
    });

  }

};

/*
---------------------------------------------------
GET SINGLE CLIENT
---------------------------------------------------
*/

export const getSingleClient = async (req: Request, res: Response) => {

  try {

    const userId = (req as any).user?.id;
    const id = req.params.id as string;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const business = await getBusinessByOwner(userId);

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
      return res.status(404).json({
        message: "Client not found",
      });
    }

    return res.json(client);

  } catch (error: any) {

    console.error("Fetch client error:", error);

    return res.status(500).json({
      message: "Fetch failed",
    });

  }

};
/* ====================================================
👇 YAHAN PASTE KAR (FILE KE END ME)
==================================================== */

export const startMetaOAuth = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const redirectUri = `${process.env.BACKEND_URL}/api/oauth/meta/callback`;

    const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${redirectUri}&scope=pages_show_list,pages_read_engagement,instagram_basic,instagram_manage_messages,whatsapp_business_management&response_type=code&state=${userId}`;

    return res.json({ url });

  } catch (error) {
    console.error("Start OAuth error:", error);

    return res.status(500).json({
      message: "Failed to start OAuth",
    });
  }
};
