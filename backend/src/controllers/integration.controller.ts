import axios from "axios";
import prisma from "../config/prisma";
import { decrypt } from "../utils/encrypt";
import { getOnboardingSnapshot } from "../services/onboarding.service";
import { fetchInstagramUsername } from "../services/instagramProfile.service";
import {
  connectInstagramOneClick,
  connectWhatsAppGuidedWizard,
  getConnectHubProjection,
  getIntegrationDiagnosticsProjection,
  meterFeatureEntitlementUsage,
  processPlanUpgrade,
  provisionTenantSaaSPackaging,
  retryConnectionDiagnostic,
  runSaaSPackagingConnectHubSelfAudit,
  saveSetupWizardProgress,
} from "../services/saasPackagingConnectHubOS.service";

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

const resolveTenantContext = async (req: any) => {
  const businessId =
    normalizeOptionalString(req.user?.businessId) ||
    normalizeOptionalString(req.body?.businessId) ||
    normalizeOptionalString(req.query?.businessId) ||
    (await getBusinessIdForRequest(req));

  if (!businessId) {
    return null;
  }

  return {
    businessId,
    tenantId:
      normalizeOptionalString(req.user?.tenantId) ||
      normalizeOptionalString(req.body?.tenantId) ||
      normalizeOptionalString(req.query?.tenantId) ||
      businessId,
  };
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

export const getConnectHubDashboard = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const dashboard = await getConnectHubProjection({
      businessId: context.businessId,
      tenantId: context.tenantId,
    });

    return res.json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load connect hub projection",
      error: String((error as Error)?.message || "connect_hub_error"),
    });
  }
};

export const provisionConnectHubTenant = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const result = await provisionTenantSaaSPackaging({
      businessId: context.businessId,
      tenantId: context.tenantId,
      legalName: normalizeOptionalString(req.body?.legalName),
      region: normalizeOptionalString(req.body?.region),
      timezone: normalizeOptionalString(req.body?.timezone),
      contactEmail: normalizeOptionalString(req.body?.contactEmail),
      plan: normalizeOptionalString(req.body?.plan) || undefined,
      replayToken: normalizeOptionalString(req.body?.replayToken),
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Failed to provision tenant",
      error: String((error as Error)?.message || "provision_failed"),
    });
  }
};

export const connectInstagramHub = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const result = await connectInstagramOneClick({
      businessId: context.businessId,
      tenantId: context.tenantId,
      environment: normalizeOptionalString(req.body?.environment) || "LIVE",
      replayToken: normalizeOptionalString(req.body?.replayToken),
      reconnect: Boolean(req.body?.reconnect),
      externalAccountRef: normalizeOptionalString(req.body?.externalAccountRef),
      scopes: Array.isArray(req.body?.scopes) ? req.body.scopes : undefined,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Instagram connect failed",
      error: String((error as Error)?.message || "instagram_connect_failed"),
    });
  }
};

export const connectWhatsAppHub = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const result = await connectWhatsAppGuidedWizard({
      businessId: context.businessId,
      tenantId: context.tenantId,
      environment: normalizeOptionalString(req.body?.environment) || "LIVE",
      replayToken: normalizeOptionalString(req.body?.replayToken),
      reconnect: Boolean(req.body?.reconnect),
      scenario: normalizeOptionalString(req.body?.scenario) as any,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "WhatsApp connect failed",
      error: String((error as Error)?.message || "whatsapp_connect_failed"),
    });
  }
};

export const retryConnectDiagnostic = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const result = await retryConnectionDiagnostic({
      businessId: context.businessId,
      tenantId: context.tenantId,
      diagnosticKey:
        normalizeOptionalString(req.body?.diagnosticKey) ||
        normalizeOptionalString(req.params?.diagnosticKey),
      retryToken: normalizeOptionalString(req.body?.retryToken),
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Retry failed",
      error: String((error as Error)?.message || "retry_failed"),
    });
  }
};

export const getIntegrationDiagnostics = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const diagnostics = await getIntegrationDiagnosticsProjection({
      businessId: context.businessId,
      tenantId: context.tenantId,
      provider:
        normalizeOptionalString(req.params?.provider) ||
        normalizeOptionalString(req.query?.provider),
      environment: normalizeOptionalString(req.query?.environment) || "LIVE",
    });

    return res.json({
      success: true,
      data: diagnostics,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch diagnostics",
      error: String((error as Error)?.message || "diagnostics_failed"),
    });
  }
};

export const saveConnectHubWizardProgress = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const result = await saveSetupWizardProgress({
      businessId: context.businessId,
      tenantId: context.tenantId,
      step: normalizeOptionalString(req.body?.step) || "BUSINESS_INFO",
      payload: req.body?.payload || {},
      replayToken: normalizeOptionalString(req.body?.replayToken),
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Failed to save wizard progress",
      error: String((error as Error)?.message || "wizard_save_failed"),
    });
  }
};

export const upgradeConnectHubPlan = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const result = await processPlanUpgrade({
      businessId: context.businessId,
      tenantId: context.tenantId,
      toPlan: normalizeOptionalString(req.body?.toPlan) || "STARTER",
      replayToken: normalizeOptionalString(req.body?.replayToken),
      remainingCycleDays: Number(req.body?.remainingCycleDays || 20),
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Upgrade failed",
      error: String((error as Error)?.message || "upgrade_failed"),
    });
  }
};

export const meterConnectHubFeatureGate = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const result = await meterFeatureEntitlementUsage({
      businessId: context.businessId,
      tenantId: context.tenantId,
      featureKey: normalizeOptionalString(req.body?.featureKey) || "channels",
      environment: normalizeOptionalString(req.body?.environment) || "LIVE",
      units: Number(req.body?.units || 1),
      replayToken: normalizeOptionalString(req.body?.replayToken),
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Feature gate check failed",
      error: String((error as Error)?.message || "feature_gate_failed"),
    });
  }
};

export const runConnectHubSelfAudit = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const audit = await runSaaSPackagingConnectHubSelfAudit({
      businessId: context.businessId,
      tenantId: context.tenantId,
    });

    return res.json({
      success: true,
      data: audit,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Self audit failed",
      error: String((error as Error)?.message || "self_audit_failed"),
    });
  }
};
