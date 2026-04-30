import axios from "axios";
import prisma from "../config/prisma";
import { decrypt } from "../utils/encrypt";
import { getOnboardingSnapshot } from "../services/onboarding.service";
import { fetchInstagramUsername } from "../services/instagramProfile.service";
import {
  applyPackagingOverride,
  assignTenantSeat,
  connectInstagramOneClick,
  connectWhatsAppGuidedWizard,
  expireIntegrationToken,
  getConnectHubProjection,
  getIntegrationDiagnosticsProjection,
  installMarketplaceArtifact,
  meterFeatureEntitlementUsage,
  processPlanUpgrade,
  promoteSandboxIntegrationToLive,
  provisionTenantSaaSPackaging,
  recoverProviderWebhook,
  refreshIntegrationToken,
  rollbackMarketplaceArtifact,
  retryConnectionDiagnostic,
  runSaaSPackagingConnectHubSelfAudit,
  runWhatsAppConnectDoctor,
  saveSetupWizardProgress,
  upsertTenantBranding,
} from "../services/saasPackagingConnectHubOS.service";
import {
  applyExtensionOverride,
  applyExtensionPolicy,
  createDeveloperPortalApiKey,
  getDeveloperPlatformProjection,
  installExtensionForTenant,
  invokeExtensionAction,
  publishExtensionPackage,
  publishExtensionRelease,
  registerDeveloperNamespace,
  revokeDeveloperPortalApiKey,
  runDeveloperPlatformSelfAudit,
  setExtensionSecretBinding,
  subscribeExtensionEvent,
} from "../services/developerPlatformExtensibilityOS.service";

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

export const runWhatsAppDoctor = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const doctor = await runWhatsAppConnectDoctor({
      businessId: context.businessId,
      tenantId: context.tenantId,
      environment: normalizeOptionalString(req.body?.environment) || "LIVE",
      autoResolve: Boolean(req.body?.autoResolve),
    });
    return res.json({
      success: true,
      data: doctor,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "WhatsApp doctor failed",
      error: String((error as Error)?.message || "whatsapp_doctor_failed"),
    });
  }
};

export const refreshConnectHubToken = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const result = await refreshIntegrationToken({
      businessId: context.businessId,
      tenantId: context.tenantId,
      provider: normalizeOptionalString(req.body?.provider) || "INSTAGRAM",
      environment: normalizeOptionalString(req.body?.environment) || "LIVE",
      replayToken: normalizeOptionalString(req.body?.replayToken),
      forceFail: Boolean(req.body?.forceFail),
    });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Token refresh failed",
      error: String((error as Error)?.message || "token_refresh_failed"),
    });
  }
};

export const expireConnectHubToken = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const result = await expireIntegrationToken({
      businessId: context.businessId,
      tenantId: context.tenantId,
      provider: normalizeOptionalString(req.body?.provider) || "INSTAGRAM",
      environment: normalizeOptionalString(req.body?.environment) || "LIVE",
      reason: normalizeOptionalString(req.body?.reason),
    });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Token expire simulation failed",
      error: String((error as Error)?.message || "token_expire_failed"),
    });
  }
};

export const recoverConnectHubWebhook = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const result = await recoverProviderWebhook({
      businessId: context.businessId,
      tenantId: context.tenantId,
      provider: normalizeOptionalString(req.body?.provider) || "INSTAGRAM",
      environment: normalizeOptionalString(req.body?.environment) || "LIVE",
      replayToken: normalizeOptionalString(req.body?.replayToken),
    });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Webhook recovery failed",
      error: String((error as Error)?.message || "webhook_recovery_failed"),
    });
  }
};

export const promoteSandboxConnectHubIntegration = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const result = await promoteSandboxIntegrationToLive({
      businessId: context.businessId,
      tenantId: context.tenantId,
      provider: normalizeOptionalString(req.body?.provider) || "INSTAGRAM",
      replayToken: normalizeOptionalString(req.body?.replayToken),
    });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Sandbox promotion failed",
      error: String((error as Error)?.message || "sandbox_promotion_failed"),
    });
  }
};

export const upsertConnectHubBranding = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const result = await upsertTenantBranding({
      businessId: context.businessId,
      tenantId: context.tenantId,
      logoRef: normalizeOptionalString(req.body?.logoRef),
      domain: normalizeOptionalString(req.body?.domain),
      theme: req.body?.theme || {},
      emailBranding: req.body?.emailBranding || {},
      whatsappIdentity: req.body?.whatsappIdentity || {},
      proposalBranding: req.body?.proposalBranding || {},
      invoiceBranding: req.body?.invoiceBranding || {},
    });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Branding update failed",
      error: String((error as Error)?.message || "branding_update_failed"),
    });
  }
};

export const installConnectHubMarketplaceArtifact = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const result = await installMarketplaceArtifact({
      businessId: context.businessId,
      tenantId: context.tenantId,
      packageKey: normalizeOptionalString(req.body?.packageKey) || "default_connector",
      packageType: (normalizeOptionalString(req.body?.packageType) || "CONNECTOR") as
        | "CONNECTOR"
        | "TEMPLATE",
      version: normalizeOptionalString(req.body?.version) || "1.0.0",
      permissionSet: Array.isArray(req.body?.permissionSet) ? req.body.permissionSet : [],
      replayToken: normalizeOptionalString(req.body?.replayToken),
    });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Marketplace install failed",
      error: String((error as Error)?.message || "marketplace_install_failed"),
    });
  }
};

export const rollbackConnectHubMarketplaceArtifact = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const result = await rollbackMarketplaceArtifact({
      businessId: context.businessId,
      tenantId: context.tenantId,
      installKey: normalizeOptionalString(req.body?.installKey) || "",
      reason: normalizeOptionalString(req.body?.reason),
    });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Marketplace rollback failed",
      error: String((error as Error)?.message || "marketplace_rollback_failed"),
    });
  }
};

export const assignConnectHubSeat = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const result = await assignTenantSeat({
      businessId: context.businessId,
      tenantId: context.tenantId,
      userId: normalizeOptionalString(req.body?.userId) || "",
      role: normalizeOptionalString(req.body?.role) || "MEMBER",
      environment: normalizeOptionalString(req.body?.environment) || "LIVE",
    });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Seat assignment failed",
      error: String((error as Error)?.message || "seat_assignment_failed"),
    });
  }
};

export const applyConnectHubOverride = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const result = await applyPackagingOverride({
      businessId: context.businessId,
      tenantId: context.tenantId,
      scope: normalizeOptionalString(req.body?.scope) || "CONNECT_HUB",
      targetType: normalizeOptionalString(req.body?.targetType) || "PROVIDER",
      targetKey: normalizeOptionalString(req.body?.targetKey),
      action: normalizeOptionalString(req.body?.action) || "ALLOW",
      reason: normalizeOptionalString(req.body?.reason) || "manual_override",
      priority: Number(req.body?.priority || 100),
      expiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt) : null,
      metadata: req.body?.metadata || {},
    });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Override application failed",
      error: String((error as Error)?.message || "override_apply_failed"),
    });
  }
};

export const getDeveloperPlatformDashboard = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const projection = await getDeveloperPlatformProjection({
      businessId: context.businessId,
      tenantId: context.tenantId,
    });
    return res.json({
      success: true,
      data: projection,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load developer platform projection",
      error: String((error as Error)?.message || "developer_platform_projection_failed"),
    });
  }
};

export const registerDeveloperPlatformNamespace = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const row = await registerDeveloperNamespace({
      businessId: context.businessId,
      tenantId: context.tenantId,
      namespace: normalizeOptionalString(req.body?.namespace) || "automexia.default",
      displayName: normalizeOptionalString(req.body?.displayName),
      ownerUserId: normalizeOptionalString(req.body?.ownerUserId) || req.user?.id || "SYSTEM",
      metadata: req.body?.metadata || {},
    });
    return res.json({
      success: true,
      data: row,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Namespace registration failed",
      error: String((error as Error)?.message || "namespace_registration_failed"),
    });
  }
};

export const publishDeveloperPlatformPackage = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const result = await publishExtensionPackage({
      businessId: context.businessId,
      tenantId: context.tenantId,
      namespace: normalizeOptionalString(req.body?.namespace),
      slug: normalizeOptionalString(req.body?.slug) || "default-extension",
      displayName: normalizeOptionalString(req.body?.displayName),
      packageType: normalizeOptionalString(req.body?.packageType) || "APP",
      visibility: normalizeOptionalString(req.body?.visibility) || "PRIVATE",
      packageKey: normalizeOptionalString(req.body?.packageKey),
      replayToken: normalizeOptionalString(req.body?.replayToken),
      metadata: req.body?.metadata || {},
    });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Package publish failed",
      error: String((error as Error)?.message || "package_publish_failed"),
    });
  }
};

export const publishDeveloperPlatformRelease = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const result = await publishExtensionRelease({
      businessId: context.businessId,
      tenantId: context.tenantId,
      packageKey: normalizeOptionalString(req.body?.packageKey) || "",
      versionTag: normalizeOptionalString(req.body?.versionTag),
      changelog: normalizeOptionalString(req.body?.changelog),
      manifest: req.body?.manifest || {},
      replayToken: normalizeOptionalString(req.body?.replayToken),
      metadata: req.body?.metadata || {},
    });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Release publish failed",
      error: String((error as Error)?.message || "release_publish_failed"),
    });
  }
};

export const installDeveloperPlatformPackage = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const result = await installExtensionForTenant({
      businessId: context.businessId,
      tenantId: context.tenantId,
      packageKey: normalizeOptionalString(req.body?.packageKey) || "",
      releaseKey: normalizeOptionalString(req.body?.releaseKey),
      environment: normalizeOptionalString(req.body?.environment) || "LIVE",
      installedBy: normalizeOptionalString(req.body?.installedBy) || req.user?.id || "SYSTEM",
      permissions: Array.isArray(req.body?.permissions) ? req.body.permissions : [],
      replayToken: normalizeOptionalString(req.body?.replayToken),
      metadata: req.body?.metadata || {},
    });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Package install failed",
      error: String((error as Error)?.message || "package_install_failed"),
    });
  }
};

export const bindDeveloperPlatformSecret = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const result = await setExtensionSecretBinding({
      businessId: context.businessId,
      tenantId: context.tenantId,
      installKey: normalizeOptionalString(req.body?.installKey) || "",
      secretName: normalizeOptionalString(req.body?.secretName) || "EXTENSION_SECRET",
      secretValue: normalizeOptionalString(req.body?.secretValue) || "",
      replayToken: normalizeOptionalString(req.body?.replayToken),
      metadata: req.body?.metadata || {},
    });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Secret binding failed",
      error: String((error as Error)?.message || "secret_binding_failed"),
    });
  }
};

export const subscribeDeveloperPlatformEvent = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const result = await subscribeExtensionEvent({
      businessId: context.businessId,
      tenantId: context.tenantId,
      installKey: normalizeOptionalString(req.body?.installKey) || "",
      eventType: normalizeOptionalString(req.body?.eventType) || "event.default",
      handler: normalizeOptionalString(req.body?.handler) || "handler.default",
      replayToken: normalizeOptionalString(req.body?.replayToken),
      metadata: req.body?.metadata || {},
    });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Event subscription failed",
      error: String((error as Error)?.message || "event_subscription_failed"),
    });
  }
};

export const invokeDeveloperPlatformPackageAction = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const result = await invokeExtensionAction({
      businessId: context.businessId,
      tenantId: context.tenantId,
      installKey: normalizeOptionalString(req.body?.installKey) || "",
      action: normalizeOptionalString(req.body?.action) || "run",
      trigger: normalizeOptionalString(req.body?.trigger) || "MANUAL",
      payload: req.body?.payload || {},
      dedupeKey: normalizeOptionalString(req.body?.dedupeKey),
      replayToken: normalizeOptionalString(req.body?.replayToken),
      forceFail: Boolean(req.body?.forceFail),
      metadata: req.body?.metadata || {},
    });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Extension execution failed",
      error: String((error as Error)?.message || "extension_execution_failed"),
    });
  }
};

export const applyDeveloperPlatformPolicy = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const result = await applyExtensionPolicy({
      businessId: context.businessId,
      tenantId: context.tenantId,
      scope: normalizeOptionalString(req.body?.scope) || "EXECUTION",
      targetType: normalizeOptionalString(req.body?.targetType) || "TENANT",
      targetKey: normalizeOptionalString(req.body?.targetKey),
      maxExecutionsPerMinute: Number(req.body?.maxExecutionsPerMinute || 120),
      timeoutMs: Number(req.body?.timeoutMs || 15000),
      requiresApproval: Boolean(req.body?.requiresApproval),
      allowedTriggers: Array.isArray(req.body?.allowedTriggers)
        ? req.body.allowedTriggers
        : ["MANUAL", "WEBHOOK", "EVENT", "SCHEDULE"],
      metadata: req.body?.metadata || {},
    });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Policy update failed",
      error: String((error as Error)?.message || "policy_update_failed"),
    });
  }
};

export const applyDeveloperPlatformOverride = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const result = await applyExtensionOverride({
      businessId: context.businessId,
      tenantId: context.tenantId,
      scope: normalizeOptionalString(req.body?.scope) || "EXECUTION",
      targetType: normalizeOptionalString(req.body?.targetType) || "TENANT",
      targetKey: normalizeOptionalString(req.body?.targetKey),
      action: normalizeOptionalString(req.body?.action) || "ALLOW",
      reason: normalizeOptionalString(req.body?.reason) || "manual_override",
      priority: Number(req.body?.priority || 100),
      expiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt) : null,
      createdBy: normalizeOptionalString(req.body?.createdBy) || req.user?.id || "SYSTEM",
      metadata: req.body?.metadata || {},
    });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Override update failed",
      error: String((error as Error)?.message || "override_update_failed"),
    });
  }
};

export const createDeveloperPlatformApiKey = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const result = await createDeveloperPortalApiKey({
      businessId: context.businessId,
      tenantId: context.tenantId,
      scope: normalizeOptionalString(req.body?.scope) || "DEVELOPER_API",
      expiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt) : null,
      replayToken: normalizeOptionalString(req.body?.replayToken),
      metadata: req.body?.metadata || {},
    });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "API key create failed",
      error: String((error as Error)?.message || "api_key_create_failed"),
    });
  }
};

export const revokeDeveloperPlatformApiKey = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const result = await revokeDeveloperPortalApiKey({
      businessId: context.businessId,
      tenantId: context.tenantId,
      apiKeyRef: normalizeOptionalString(req.body?.apiKeyRef) || "",
      reason: normalizeOptionalString(req.body?.reason) || "manual_revoke",
    });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "API key revoke failed",
      error: String((error as Error)?.message || "api_key_revoke_failed"),
    });
  }
};

export const runDeveloperPlatformExtensibilitySelfAudit = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const audit = await runDeveloperPlatformSelfAudit({
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
      message: "Developer platform self audit failed",
      error: String((error as Error)?.message || "developer_platform_self_audit_failed"),
    });
  }
};
