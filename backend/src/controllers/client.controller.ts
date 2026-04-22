import { Request, Response } from "express";
import prisma from "../config/prisma";
import { encrypt } from "../utils/encrypt";
import axios from "axios";
import { getPlanKey } from "../config/plan.config";
import { resolvePlanContext } from "../services/feature.service";
import { triggerOnboardingDemo } from "../services/onboarding.service";
import { checkConnectionHealth } from "../services/connectionHealth.service";
import { getRequestBusinessId } from "../services/tenant.service";

/*
---------------------------------------------------
HELPER FUNCTIONS
---------------------------------------------------
*/

const normalizeOptionalString = (value?: unknown) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

const getMetaDataArray = (value: any) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (Array.isArray(value?.data)) {
    return value.data;
  }

  return [];
};

const getAxiosErrorMessage = (error: any) =>
  error?.response?.data?.error?.message ||
  error?.response?.data?.message ||
  error?.message ||
  "Unknown error";

const createClientControllerError = (message: string, code: string) => {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
};

const extractFirstWhatsAppPhoneNumberId = (payload: any) => {
  const queue = [payload];
  const visited = new Set<any>();

  while (queue.length) {
    const node = queue.shift();

    if (!node || typeof node !== "object" || visited.has(node)) {
      continue;
    }

    visited.add(node);

    const phoneNumbers = getMetaDataArray((node as any).phone_numbers);

    for (const phoneNumber of phoneNumbers) {
      const phoneNumberId = normalizeOptionalString(phoneNumber?.id);

      if (phoneNumberId) {
        return phoneNumberId;
      }
    }

    for (const child of Object.values(node)) {
      if (child && typeof child === "object") {
        queue.push(child);
      }
    }
  }

  return null;
};

const fetchInstagramConnection = async (accessToken: string) => {
  const pagesRes = await axios.get(
    "https://graph.facebook.com/v19.0/me/accounts",
    {
      params: {
        fields: "id,name,access_token,instagram_business_account",
        access_token: accessToken,
      },
    }
  );

  const page = getMetaDataArray(pagesRes.data)?.[0];
  const facebookPageId = normalizeOptionalString(page?.id);
  const pageId =
    normalizeOptionalString(page?.instagram_business_account?.id) ||
    facebookPageId;
  const pageAccessToken =
    normalizeOptionalString(page?.access_token) || normalizeOptionalString(accessToken);

  console.log("INSTAGRAM CONNECT IDENTIFIERS", {
    facebookPageId,
    pageId,
  });

  return {
    facebookPageId,
    pageId,
    pageAccessToken,
  };
};

const fetchWhatsAppPhoneNumberId = async (accessToken: string) => {
  const lookupRequests = [
    {
      label: "me/businesses",
      url: "https://graph.facebook.com/v19.0/me/businesses",
      params: {
        fields:
          "id,name,owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}},client_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}",
        access_token: accessToken,
      },
    },
    {
      label: "me",
      url: "https://graph.facebook.com/v19.0/me",
      params: {
        fields:
          "businesses{id,name,owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}},client_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}}",
        access_token: accessToken,
      },
    },
  ];

  for (const lookup of lookupRequests) {
    try {
      const response = await axios.get(lookup.url, {
        params: lookup.params,
      });

      const phoneNumberId = extractFirstWhatsAppPhoneNumberId(response.data);

      if (phoneNumberId) {
        console.log("WHATSAPP CONNECT IDENTIFIERS", {
          source: lookup.label,
          phoneNumberId,
        });

        return phoneNumberId;
      }
    } catch (error: any) {
      console.log("WHATSAPP CONNECT LOOKUP FAILED", {
        source: lookup.label,
        message: getAxiosErrorMessage(error),
      });
    }
  }

  return null;
};

const upsertConnectedClient = async ({
  businessId,
  platform,
  phoneNumberId,
  pageId,
  accessToken,
  aiTone,
  businessInfo,
  pricingInfo,
  faqKnowledge,
  salesInstructions,
}: {
  businessId: string;
  platform: string;
  phoneNumberId?: unknown;
  pageId?: unknown;
  accessToken: string;
  aiTone?: unknown;
  businessInfo?: unknown;
  pricingInfo?: unknown;
  faqKnowledge?: unknown;
  salesInstructions?: unknown;
}) => {
  const normalizedPlatform =
    normalizeOptionalString(platform)?.toUpperCase() || "SYSTEM";
  const normalizedPhoneNumberId = normalizeOptionalString(phoneNumberId);
  const normalizedPageId = normalizeOptionalString(pageId);
  const normalizedAccessToken = String(accessToken || "").trim();
  const uniqueWhere = normalizedPageId
    ? { pageId: normalizedPageId }
    : normalizedPhoneNumberId
      ? { phoneNumberId: normalizedPhoneNumberId }
      : null;

  if (!uniqueWhere) {
    throw createClientControllerError(
      "pageId or phoneNumberId is required",
      "CLIENT_UNIQUE_KEY_REQUIRED"
    );
  }

  const existingPlatformClient = await prisma.client.findUnique({
    where: {
      businessId_platform: {
        businessId,
        platform: normalizedPlatform,
      },
    },
  });

  if (normalizedPageId) {
    const existingPageClient = await prisma.client.findUnique({
      where: {
        pageId: normalizedPageId,
      },
    });

    if (
      existingPageClient &&
      existingPageClient.businessId !== businessId &&
      existingPageClient.id !== existingPlatformClient?.id
    ) {
      throw createClientControllerError(
        "This connected account already exists for another business",
        "CLIENT_OWNERSHIP_CONFLICT"
      );
    }
  }

  if (normalizedPhoneNumberId) {
    const existingPhoneClient = await prisma.client.findUnique({
      where: {
        phoneNumberId: normalizedPhoneNumberId,
      },
    });

    if (
      existingPhoneClient &&
      existingPhoneClient.businessId !== businessId &&
      existingPhoneClient.id !== existingPlatformClient?.id
    ) {
      throw createClientControllerError(
        "This connected account already exists for another business",
        "CLIENT_OWNERSHIP_CONFLICT"
      );
    }
  }

  const updateData = {
    businessId,
    platform: normalizedPlatform,
    phoneNumberId:
      normalizedPhoneNumberId || existingPlatformClient?.phoneNumberId || null,
    pageId: normalizedPageId || existingPlatformClient?.pageId || null,
    accessToken: normalizedAccessToken,
    ...(aiTone !== undefined
      ? { aiTone: normalizeOptionalString(aiTone) }
      : {}),
    ...(businessInfo !== undefined
      ? { businessInfo: normalizeOptionalString(businessInfo) }
      : {}),
    ...(pricingInfo !== undefined
      ? { pricingInfo: normalizeOptionalString(pricingInfo) }
      : {}),
    ...(faqKnowledge !== undefined
      ? { faqKnowledge: normalizeOptionalString(faqKnowledge) }
      : {}),
    ...(salesInstructions !== undefined
      ? { salesInstructions: normalizeOptionalString(salesInstructions) }
      : {}),
    isActive: true,
    deletedAt: null,
  };

  if (existingPlatformClient) {
    const client = await prisma.client.update({
      where: { id: existingPlatformClient.id },
      data: updateData,
    });

    console.log("CLIENT UPSERT SUCCESS", {
      businessId: client.businessId,
      platform: client.platform,
      pageId: client.pageId,
      phoneNumberId: client.phoneNumberId,
    });

    return client;
  }

  if (normalizedPhoneNumberId) {
    const client = await prisma.client.upsert({
      where: { phoneNumberId: normalizedPhoneNumberId },
      update: updateData,
      create: updateData,
    });

    console.log("CLIENT UPSERT SUCCESS", {
      businessId: client.businessId,
      platform: client.platform,
      pageId: client.pageId,
      phoneNumberId: client.phoneNumberId,
    });

    return client;
  }

  if (normalizedPageId) {
    const client = await prisma.client.upsert({
      where: { pageId: normalizedPageId },
      update: updateData,
      create: updateData,
    });

    console.log("CLIENT UPSERT SUCCESS", {
      businessId: client.businessId,
      platform: client.platform,
      pageId: client.pageId,
      phoneNumberId: client.phoneNumberId,
    });

    return client;
  }

  const client = await prisma.client.upsert({
    where: uniqueWhere,
    update: updateData,
    create: updateData,
  });

  console.log("CLIENT UPSERT SUCCESS", {
    businessId: client.businessId,
    pageId: client.pageId,
    phoneNumberId: client.phoneNumberId,
  });

  return client;
};

const getBusinessByOwner = async (userId: string) => {
  return prisma.business.findFirst({
    where: { ownerId: userId },
    select: { id: true },
  });
};

const resolveBusinessIdForRequest = async (req: Request) => {
  const requestBusinessId = getRequestBusinessId(req) || req.businessId;

  if (requestBusinessId) {
    return requestBusinessId;
  }

  const userId = (req as any).user?.id;

  if (!userId) {
    return null;
  }

  const business = await getBusinessByOwner(userId);
  return business?.id || null;
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

    let resolvedPhoneNumberId = normalizeOptionalString(phoneNumberId);
    let resolvedPageId = normalizeOptionalString(pageId);

    if (platform === "WHATSAPP" && !resolvedPhoneNumberId) {
      resolvedPhoneNumberId = await fetchWhatsAppPhoneNumberId(accessToken);
    }

    if (platform === "INSTAGRAM" && !resolvedPageId) {
      const instagramConnection = await fetchInstagramConnection(accessToken);

      resolvedPageId = instagramConnection.pageId;
      accessToken = instagramConnection.pageAccessToken || accessToken;
    }

    if (platform === "WHATSAPP" && !resolvedPhoneNumberId) {
      return res.status(400).json({
        message: "Unable to resolve WhatsApp phone number ID",
      });
    }

    if (platform === "INSTAGRAM" && !resolvedPageId) {
      return res.status(400).json({
        message: "Unable to resolve Instagram page ID",
      });
    }

    const encryptedToken = encrypt(accessToken);

    const client = await upsertConnectedClient({
      businessId: business.id,
      platform,
      phoneNumberId: resolvedPhoneNumberId,
      pageId: resolvedPageId,
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

    const instagramConnection = await fetchInstagramConnection(longToken);

    if (!instagramConnection.pageId) {
      return res.status(400).json({
        message: "No Instagram page found",
      });
    }

    const instagramAccessToken =
      instagramConnection.pageAccessToken || longToken;
    const encryptedInstagramToken = encrypt(instagramAccessToken);

    const client = await upsertConnectedClient({
      businessId: business.id,
      platform: "INSTAGRAM",
      pageId: instagramConnection.pageId,
      accessToken: encryptedInstagramToken,
      aiTone,
      businessInfo,
      pricingInfo,
      faqKnowledge,
      salesInstructions,
    });

    if (allowedPlatforms.includes("WHATSAPP")) {
      const phoneNumberId = await fetchWhatsAppPhoneNumberId(longToken);
      const encryptedWhatsAppToken = encrypt(longToken);

      await upsertConnectedClient({
        businessId: business.id,
        platform: "WHATSAPP",
        phoneNumberId,
        accessToken: encryptedWhatsAppToken,
      }).catch((error) => {
        console.log("WHATSAPP CLIENT UPSERT FAILED", {
          businessId: business.id,
          phoneNumberId,
          message: getAxiosErrorMessage(error),
        });
      });
    }

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
CLIENT CONNECTION STATUS
---------------------------------------------------
*/

export const getClientStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const business = await getBusinessByOwner(userId);

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const [instagramClient, whatsappClient] = await Promise.all([
      prisma.client.findFirst({
        where: {
          businessId: business.id,
          platform: "INSTAGRAM",
          deletedAt: null,
        },
        select: {
          id: true,
          platform: true,
          pageId: true,
          accessToken: true,
          isActive: true,
        },
      }),
      prisma.client.findFirst({
        where: {
          businessId: business.id,
          platform: "WHATSAPP",
          deletedAt: null,
        },
        select: {
          id: true,
          platform: true,
          phoneNumberId: true,
          accessToken: true,
          isActive: true,
        },
      }),
    ]);

    const [instagramHealthy, whatsappHealthy] = await Promise.all([
      instagramClient?.pageId && instagramClient.isActive
        ? checkConnectionHealth(instagramClient)
        : false,
      whatsappClient?.phoneNumberId && whatsappClient.isActive
        ? checkConnectionHealth(whatsappClient)
        : false,
    ]);

    return res.json({
      instagram: {
        connected: Boolean(instagramClient?.pageId),
        pageId: instagramClient?.pageId || null,
        healthy: instagramHealthy,
      },
      whatsapp: {
        connected: Boolean(whatsappClient?.phoneNumberId),
        phoneNumberId: whatsappClient?.phoneNumberId || null,
        healthy: whatsappHealthy,
      },
    });
  } catch (error) {
    console.error("Client status error:", error);

    return res.status(500).json({
      message: "Failed to load client status",
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
      return res.status(401).json({
        success: false,
        data: [],
        message: "Unauthorized",
      });
    }

    const businessId = await resolveBusinessIdForRequest(req);

    console.log("GET /clients hit", {
      userId,
      businessId,
    });

    if (!businessId) {
      return res.json({
        success: true,
        data: [],
        clients: [],
      });
    }

    const clients = await prisma.client.findMany({
      where: {
        businessId,
        isActive: true,
        deletedAt: null,
        platform: {
          not: "SYSTEM",
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      success: true,
      data: clients,
      clients,
    });

  } catch (error: any) {

    console.error("API ERROR:", error);

    return res.status(500).json({
      success: false,
      data: [],
      message: "Internal error",
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

    const mode = String(req.query.mode || "").trim().toLowerCase();
    const platform =
      normalizeOptionalString(req.query.platform)?.toUpperCase() || null;

    if (mode === "reconnect") {
      console.info("Reconnect triggered", {
        userId,
        platform,
      });
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
