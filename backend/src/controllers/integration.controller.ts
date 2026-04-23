import axios from "axios";
import prisma from "../config/prisma";
import { decrypt } from "../utils/encrypt";
import { getOnboardingSnapshot } from "../services/onboarding.service";
import { fetchInstagramUsername } from "../services/instagramProfile.service";

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

const getBusinessIdForRequest = async (req: any) => {
  const businessId = req.user?.businessId || req.businessId;

  if (businessId) {
    return businessId;
  }

  if (!req.user?.id) {
    return null;
  }

  const business = await prisma.business.findFirst({
    where: { ownerId: req.user.id },
    select: { id: true },
  });

  return business?.id || null;
};

type InstagramAccount = {
  clientId: string;
  pageId: string;
  igUserId: string;
  name: string;
};

const buildFallbackInstagramAccount = async (client: {
  id: string;
  pageId: string | null;
  accessToken: string | null;
}): Promise<InstagramAccount | null> => {
  const pageId = normalizeOptionalString(client.pageId);

  if (!pageId) {
    return null;
  }

  const username = await fetchInstagramUsername(
    pageId,
    client.accessToken || null
  );

  return {
    clientId: client.id,
    pageId,
    igUserId: pageId,
    name: username || pageId,
  };
};

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

export const getInstagramAccounts = async (req: any, res: any) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        message: "Missing Authorization bearer token or session",
      });
    }

    const businessId = await getBusinessIdForRequest(req);

    if (!businessId) {
      console.log("IG accounts fetched:", []);
      return res.status(200).json([]);
    }

    const clients = await prisma.client.findMany({
      where: {
        businessId,
        platform: "INSTAGRAM",
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        pageId: true,
        accessToken: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!clients.length) {
      console.log("IG accounts fetched:", []);
      return res.status(200).json([]);
    }

    const accountsByClientId = new Map<string, InstagramAccount>();

    for (const client of clients) {
      const clientPageId = normalizeOptionalString(client.pageId);

      if (!clientPageId || !client.accessToken) {
        continue;
      }

      try {
        const accessToken = decrypt(client.accessToken);
        const pagesRes = await axios.get(
          "https://graph.facebook.com/v19.0/me/accounts",
          {
            params: {
              access_token: accessToken,
              fields: "id,name",
            },
            timeout: 10000,
          }
        );

        const pages = getMetaDataArray(pagesRes.data);

        for (const page of pages) {
          const pageId = normalizeOptionalString(page?.id);

          if (!pageId) {
            continue;
          }

          try {
            const pageRes = await axios.get(
              `https://graph.facebook.com/v19.0/${pageId}`,
              {
                params: {
                  fields: "instagram_business_account,name",
                  access_token: accessToken,
                },
                timeout: 10000,
              }
            );

            const igUserId = normalizeOptionalString(
              pageRes.data?.instagram_business_account?.id
            );

            if (!igUserId) {
              continue;
            }

            if (clientPageId !== igUserId && clientPageId !== pageId) {
              continue;
            }

            accountsByClientId.set(client.id, {
              clientId: client.id,
              pageId,
              igUserId,
              name:
                normalizeOptionalString(pageRes.data?.name) ||
                normalizeOptionalString(page?.name) ||
                igUserId,
            });
          } catch (pageError) {
            console.warn("Instagram page lookup failed:", {
              clientId: client.id,
              pageId,
              error:
                (pageError as any)?.response?.data ||
                (pageError as Error)?.message ||
                pageError,
            });
          }
        }
      } catch (error) {
        console.warn("Instagram accounts lookup failed:", {
          clientId: client.id,
          error:
            (error as any)?.response?.data ||
            (error as Error)?.message ||
            error,
        });
      }

      if (!accountsByClientId.has(client.id)) {
        const fallbackAccount = await buildFallbackInstagramAccount(client);

        if (fallbackAccount) {
          accountsByClientId.set(client.id, fallbackAccount);
        }
      }
    }

    const accounts = Array.from(accountsByClientId.values());

    console.log("IG accounts fetched:", accounts);

    return res.status(200).json(accounts);
  } catch (err) {
    console.error("IG accounts error:", err);
    return res.status(200).json([]);
  }
};
