import axios from "axios";
import prisma from "../config/prisma";
import { decrypt } from "../utils/encrypt";
import { fetchInstagramUsername } from "../services/instagramProfile.service";
import {
  TimeoutExceededError,
  withTimeout,
  withTimeoutFallback,
} from "../utils/boundedTimeout";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
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
  runMetaConnectDoctor,
  seedMetaReviewerMode,
  generateMetaAppReviewPack,
  rollbackMarketplaceArtifact,
  retryConnectionDiagnostic,
  runSaaSPackagingConnectHubSelfAudit,
  runWhatsAppConnectDoctor,
  saveSetupWizardProgress,
  upsertTenantBranding,
} from "../services/saasPackagingConnectHubOS.service";
import { InstagramConnectionHealthService } from "../services/connectionHealth.service";
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
import {
  noteIntegrationOnboardingReconcileIntent,
  readIntegrationOnboardingFastLaneSnapshot,
} from "../services/integrationOnboardingProjection.service";
import { enqueueIntegrationOnboardingProjectionReconcile } from "../queues/integrationOnboardingProjection.queue";
import {
  scheduleDeferredIntegrationProjectionReconcile,
} from "../services/integrationProjectionRecovery.service";

const INTEGRATION_API_TIMEOUT_MS = 1800;
const RECONCILE_ENQUEUE_RUNTIME_BUDGET_MS = Math.max(
  80,
  Number(process.env.INTEGRATION_RECONCILE_ENQUEUE_BUDGET_MS || 150)
);

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

    const clientsResult = await withTimeoutFallback({
      label: "integrations_projection",
      timeoutMs: INTEGRATION_API_TIMEOUT_MS,
      task: prisma.client.findMany({
        where: { businessId },
        select: {
          id: true,
          platform: true,
          isActive: true,
        },
      }),
      fallback: [],
    });

    return res.json(clientsResult.value);
  } catch (err) {
    return res.json([]);
  }
};

export const getOnboarding = async (req: any, res: any) => {
  const startedAtMs = Date.now();
  try {
    const businessId = req.user?.businessId;
    const tenantId =
      normalizeOptionalString(req.user?.tenantId) ||
      normalizeOptionalString(req.query?.tenantId) ||
      businessId;

    if (!businessId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const fastLane = await readIntegrationOnboardingFastLaneSnapshot({
      businessId,
      tenantId,
    });

    let reconcileScheduled = false;
    let reconcileDeferred = false;
    let queueUnavailable = false;
    let queueDegradedReason: string | null = null;
    let recoveryKey: string | null = null;
    let recoveryRetryAttempt: number | null = null;
    let projectionRecoveryQueueDepth: number | null = null;
    if (fastLane.recommendReconcile) {
      const intent = noteIntegrationOnboardingReconcileIntent({
        businessId,
        tenantId,
      });
      if (intent.shouldQueue) {
        try {
          const enqueueResult = await withTimeout({
            label: "integrations_onboarding_reconcile_enqueue",
            timeoutMs: RECONCILE_ENQUEUE_RUNTIME_BUDGET_MS,
            task: enqueueIntegrationOnboardingProjectionReconcile({
              type: "ONBOARDING_RECONCILE",
              businessId,
              tenantId,
              reason: fastLane.reconcileReason,
              source: "api_fast_lane",
            }),
          });
          if (enqueueResult.enqueued) {
            reconcileScheduled = true;
          } else {
            queueUnavailable = enqueueResult.queueUnavailable;
            queueDegradedReason =
              normalizeOptionalString(enqueueResult.reason) ||
              "queue_unavailable";
          }
        } catch (error) {
          queueUnavailable = true;
          queueDegradedReason = error instanceof TimeoutExceededError
            ? `enqueue_timeout_${RECONCILE_ENQUEUE_RUNTIME_BUDGET_MS}ms`
            : normalizeOptionalString((error as Error)?.message) || "enqueue_failed";
        }

        if (!reconcileScheduled) {
          reconcileDeferred = true;
          scheduleDeferredIntegrationProjectionReconcile({
            businessId,
            tenantId,
            reason: fastLane.reconcileReason,
            source: "api_fast_lane",
            queueError: queueDegradedReason || "queue_unavailable",
            includeQueueDepth: false,
          }).catch((err) => {
            console.warn("Async scheduleDeferredIntegrationProjectionReconcile error:", err);
          });
          emitPerformanceMetric({
            name: "reconcile_inline_prevented",
            value: 1,
            businessId,
            route: "integrations_onboarding_projection",
            metadata: {
              tenantId: tenantId || businessId,
              reason: fastLane.reconcileReason,
              queueReason: queueDegradedReason || "queue_unavailable",
              recoveryKey,
            },
          });
          emitPerformanceMetric({
            name: "queue_unavailable_degraded_served",
            value: 1,
            businessId,
            route: "integrations_onboarding_projection",
            metadata: {
              tenantId: tenantId || businessId,
              reason: queueDegradedReason || "queue_unavailable",
              recoveryKey,
              retryAttempt: recoveryRetryAttempt,
            },
          });
        }
      }
    }

    const snapshotWithRuntime = {
      ...fastLane.snapshot,
      integrationProjection: {
        ...(fastLane.snapshot.integrationProjection || {}),
        degradedRuntime: {
          deferred: reconcileDeferred,
          queueUnavailable,
          recoveryKey,
          retryAttempt: recoveryRetryAttempt,
          recoveryQueueDepth: projectionRecoveryQueueDepth,
          reason:
            queueDegradedReason ||
            fastLane.snapshot.integrationProjection?.staleReason ||
            null,
          lastQueueError: queueDegradedReason,
        },
      },
    };

    if (fastLane.degraded || reconcileDeferred) {
      emitPerformanceMetric({
        name: "degraded_projection_state_count",
        value: 1,
        businessId,
        route: "integrations_onboarding_projection",
        metadata: {
          stale: fastLane.stale,
          processingState: fastLane.processingState,
          reconcileDeferred,
          queueUnavailable,
        },
      });
    }

    emitPerformanceMetric({
      name: "integration_projection_ms",
      value: Date.now() - startedAtMs,
      businessId,
      route: "integrations_onboarding_projection",
      metadata: {
        cache: fastLane.cache,
        cacheHit: fastLane.cacheHit,
        stale: fastLane.stale,
        staleAgeMs: fastLane.staleAgeMs,
        state: fastLane.processingState,
        degraded: fastLane.degraded,
        reconcileScheduled,
        reconcileDeferred,
        queueUnavailable,
        recoveryKey,
        projectionRecoveryQueueDepth,
      },
    });

    return res.json({
      success: true,
      data: snapshotWithRuntime,
      meta: {
        degraded: fastLane.degraded || reconcileDeferred,
        cache: fastLane.cache,
        stale: fastLane.stale,
        staleAgeMs: fastLane.staleAgeMs,
        processingState: fastLane.processingState,
        verificationState: fastLane.verificationState,
        reconcileInFlight: fastLane.reconcileInFlight,
        reconcileScheduled,
        reconcileDeferred,
        queueUnavailable,
        recoveryKey,
        recoveryRetryAttempt,
        projectionRecoveryQueueDepth,
        queueDegradedReason,
        lastSuccessfulReconcileAt: fastLane.lastSuccessfulReconcileAt,
        lastReconcileError: fastLane.lastReconcileError,
      },
    });
  } catch (err) {
    const businessId = req.user?.businessId || null;
    const refreshedAt = new Date().toISOString();
    const fallbackSnapshot = {
      onboardingCompleted: false,
      onboardingStep: 1,
      demoCompleted: false,
      connectedPlatforms: [],
      primaryPlatform: null,
      checklist: {
        connectedAccount: false,
        demoReplyReady: false,
        sendTestPromptReady: false,
        realReplyReady: false,
      },
      demo: {
        label: "This is how AI replies automatically",
        prompt: "Hi, I want to know more about your service",
        leadId: null,
        userMessage: null,
        aiMessage: null,
      },
      realReply: {
        leadId: null,
        userMessage: null,
        aiMessage: null,
      },
      trial: {
        active: false,
        totalDays: 14,
        daysLeft: 0,
        nearEnd: false,
      },
      usage: {
        aiUsedToday: 0,
        aiLimit: 0,
        aiRemaining: null,
        aiUsagePercent: 0,
        warning: false,
        warningMessage: null,
      },
      upgrade: {
        show: false,
        reasons: [],
        headline: "You're getting great results",
        message: "Upgrade to keep automation running",
        ctaHref: "/billing",
      },
      integrationProjection: {
        processingState: "PROCESSING",
        verificationState: "UNVERIFIED",
        providers: [],
        providerStateSummary: {
          total: 0,
          active: 0,
          verifying: 0,
          reconciling: 0,
          delayed: 0,
          actionRequired: 0,
        },
        accountMappingReady: false,
        reconnectRequired: false,
        stale: true,
        staleAgeMs: 0,
        staleReason: "fast_lane_failed",
        reconcileInFlight: false,
        lastSuccessfulReconcileAt: null,
        refreshedAt,
        degradedRuntime: {
          deferred: false,
          queueUnavailable: false,
          recoveryKey: null,
          retryAttempt: null,
          recoveryQueueDepth: null,
          reason: "fast_lane_failed",
          lastQueueError: null,
        },
      },
    };
    emitPerformanceMetric({
      name: "integration_projection_ms",
      value: Date.now() - startedAtMs,
      businessId,
      route: "integrations_onboarding_projection",
      metadata: {
        degraded: true,
        reason: String((err as Error)?.message || "fast_lane_failed"),
      },
    });
    emitPerformanceMetric({
      name: "degraded_projection_state_count",
      value: 1,
      businessId,
      route: "integrations_onboarding_projection",
      metadata: {
        reason: "fast_lane_failed",
      },
    });
    return res.json({
      success: true,
      data: fallbackSnapshot,
      meta: {
        degraded: true,
        cache: "fallback",
        stale: true,
        staleAgeMs: 0,
        processingState: "PROCESSING",
        verificationState: "UNVERIFIED",
        reconcileInFlight: false,
        reconcileScheduled: false,
        reconcileDeferred: false,
        queueUnavailable: false,
        recoveryKey: null,
        recoveryRetryAttempt: null,
        projectionRecoveryQueueDepth: null,
        queueDegradedReason: "fast_lane_failed",
        lastSuccessfulReconcileAt: null,
        lastReconcileError: String((err as Error)?.message || "fast_lane_failed"),
      },
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
            timeout: 1200,
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
                timeout: 1200,
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

    const dashboardResult = await withTimeoutFallback({
      label: "integrations_connect_hub_projection",
      timeoutMs: INTEGRATION_API_TIMEOUT_MS,
      task: getConnectHubProjection({
        businessId: context.businessId,
        tenantId: context.tenantId,
      }),
      fallback: null,
    });

    return res.json({
      success: true,
      data: dashboardResult.value,
      meta: {
        degraded: dashboardResult.timedOut || dashboardResult.failed,
      },
    });
  } catch (error) {
    return res.json({
      success: true,
      data: null,
      meta: {
        degraded: true,
      },
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
      metaProof: req.body?.metaProof || undefined,
      simulate: req.body?.simulate || undefined,
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
      businessManagerId: normalizeOptionalString(req.body?.businessManagerId),
      wabaId: normalizeOptionalString(req.body?.wabaId),
      phoneNumberId: normalizeOptionalString(req.body?.phoneNumberId),
      displayName: normalizeOptionalString(req.body?.displayName),
      displayNameReviewStatus: normalizeOptionalString(req.body?.displayNameReviewStatus),
      qualityRating: normalizeOptionalString(req.body?.qualityRating),
      tier: normalizeOptionalString(req.body?.tier),
      allowSandboxSlot: req.body?.allowSandboxSlot === true,
      metaProof: req.body?.metaProof || undefined,
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

export const runMetaDoctor = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const doctor = await runMetaConnectDoctor({
      businessId: context.businessId,
      tenantId: context.tenantId,
      provider: normalizeOptionalString(req.body?.provider) || "ALL",
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
      message: "Meta doctor failed",
      error: String((error as Error)?.message || "meta_doctor_failed"),
    });
  }
};

export const runMetaTokenLifecycle = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const enqueueResult = await withTimeout({
      label: "integrations_token_sweep_enqueue",
      timeoutMs: RECONCILE_ENQUEUE_RUNTIME_BUDGET_MS,
      task: enqueueIntegrationOnboardingProjectionReconcile({
        type: "ONBOARDING_RECONCILE",
        businessId: context.businessId,
        tenantId: context.tenantId,
        reason: "manual_token_lifecycle_sweep",
        source: "connect_hub_token_sweep",
      }),
    }).catch(() => ({
      enqueued: false,
      deferred: true,
      duplicate: false,
      queueUnavailable: true,
      jobId: "",
      reason: "enqueue_failed",
    }));

    if (enqueueResult.enqueued) {
      return res.status(202).json({
        success: true,
        data: {
          status: "QUEUED",
          operation: "META_TOKEN_LIFECYCLE_SWEEP",
          queueJobId: enqueueResult.jobId,
        },
      });
    }

    const deferred = await scheduleDeferredIntegrationProjectionReconcile({
      businessId: context.businessId,
      tenantId: context.tenantId,
      reason: "manual_token_lifecycle_sweep",
      source: "connect_hub_token_sweep",
      queueError: normalizeOptionalString(enqueueResult.reason) || "queue_unavailable",
    }).catch(() => null);

    emitPerformanceMetric({
      name: "reconcile_inline_prevented",
      value: 1,
      businessId: context.businessId,
      route: "integrations_connect_hub_token_sweep",
      metadata: {
        reason: "queue_unavailable",
        recoveryKey: deferred?.recoveryKey || null,
      },
    });

    return res.status(202).json({
      success: true,
      data: {
        status: "DEFERRED",
        operation: "META_TOKEN_LIFECYCLE_SWEEP",
        recoveryKey: deferred?.recoveryKey || null,
        retryAttempt: deferred?.retryAttempt ?? null,
        recoveryQueueDepth: deferred?.queueDepth ?? null,
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Meta token lifecycle sweep failed",
      error: String((error as Error)?.message || "meta_token_sweep_failed"),
    });
  }
};

export const runMetaColdBootReconcile = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const enqueueResult = await withTimeout({
      label: "integrations_cold_boot_reconcile_enqueue",
      timeoutMs: RECONCILE_ENQUEUE_RUNTIME_BUDGET_MS,
      task: enqueueIntegrationOnboardingProjectionReconcile({
        type: "ONBOARDING_RECONCILE",
        businessId: context.businessId,
        tenantId: context.tenantId,
        reason: "manual_cold_boot_reconcile",
        source: "connect_hub_cold_boot",
      }),
    }).catch(() => ({
      enqueued: false,
      deferred: true,
      duplicate: false,
      queueUnavailable: true,
      jobId: "",
      reason: "enqueue_failed",
    }));

    if (enqueueResult.enqueued) {
      return res.status(202).json({
        success: true,
        data: {
          status: "QUEUED",
          operation: "META_COLD_BOOT_RECONCILE",
          queueJobId: enqueueResult.jobId,
        },
      });
    }

    const deferred = await scheduleDeferredIntegrationProjectionReconcile({
      businessId: context.businessId,
      tenantId: context.tenantId,
      reason: "manual_cold_boot_reconcile",
      source: "connect_hub_cold_boot",
      queueError: normalizeOptionalString(enqueueResult.reason) || "queue_unavailable",
    }).catch(() => null);

    emitPerformanceMetric({
      name: "reconcile_inline_prevented",
      value: 1,
      businessId: context.businessId,
      route: "integrations_connect_hub_cold_boot",
      metadata: {
        reason: "queue_unavailable",
        recoveryKey: deferred?.recoveryKey || null,
      },
    });

    return res.status(202).json({
      success: true,
      data: {
        status: "DEFERRED",
        operation: "META_COLD_BOOT_RECONCILE",
        recoveryKey: deferred?.recoveryKey || null,
        retryAttempt: deferred?.retryAttempt ?? null,
        recoveryQueueDepth: deferred?.queueDepth ?? null,
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Cold boot reconcile failed",
      error: String((error as Error)?.message || "cold_boot_reconcile_failed"),
    });
  }
};

export const seedMetaReviewerDemo = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const result = await seedMetaReviewerMode({
      businessId: context.businessId,
      tenantId: context.tenantId,
      environment: normalizeOptionalString(req.body?.environment) || "SANDBOX",
    });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Reviewer demo seed failed",
      error: String((error as Error)?.message || "reviewer_seed_failed"),
    });
  }
};

export const generateMetaReviewPack = async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req);
    if (!context) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const pack = await generateMetaAppReviewPack({
      businessId: context.businessId,
      tenantId: context.tenantId,
      environment: normalizeOptionalString(req.query?.environment) || "LIVE",
    });
    return res.json({
      success: true,
      data: pack,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Review pack generation failed",
      error: String((error as Error)?.message || "review_pack_failed"),
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

export const getInstagramConnectionTrace = async (req: any, res: any) => {
  try {
    const { connectionId } = req.params;

    if (!connectionId) {
      return res.status(400).json({
        success: false,
        message: "connectionId param is required",
      });
    }

    const trace = await prisma.traceLedger.findFirst({
      where: {
        OR: [
          { traceId: connectionId },
          { traceId: `ig_connect_${connectionId}` },
          { correlationId: connectionId }
        ]
      }
    });

    if (!trace) {
      return res.status(404).json({
        success: false,
        message: "Trace not found",
      });
    }

    const lifecycle = Array.isArray(trace.lifecycle) ? (trace.lifecycle as any[]) : [];
    const currentStage = lifecycle.length > 0 ? lifecycle[lifecycle.length - 1].stage : null;
    const completedStages = lifecycle
      .filter((s: any) => s.status === "COMPLETED")
      .map((s: any) => s.stage);
    const failedStage = trace.status === "FAILED" ? currentStage : null;
    const duration = trace.endedAt 
      ? new Date(trace.endedAt).getTime() - new Date(trace.startedAt).getTime() 
      : Date.now() - new Date(trace.startedAt).getTime();
    const errors = lifecycle
      .filter((s: any) => s.status === "FAILED")
      .map((s: any) => s.metadata?.reason || s.metadata?.message || "Unknown error");

    return res.json({
      connectionId,
      currentStage,
      completedStages,
      failedStage,
      duration,
      errors
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve connection trace",
      error: String((error as Error)?.message || "trace_retrieve_failed"),
    });
  }
};

export const getInstagramStatus = async (req: any, res: any) => {
  try {
    const businessId = await getBusinessIdForRequest(req);
    if (!businessId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const client = await prisma.client.findFirst({
      where: {
        businessId,
        platform: "INSTAGRAM",
        deletedAt: null,
      },
      select: {
        id: true,
        isActive: true,
        connectionStatus: true,
        healthScore: true,
        lastHealthCheck: true,
        lastSuccessfulSync: true,
        lastFailureReason: true,
      },
    });

    if (!client) {
      return res.status(200).json({
        success: true,
        connected: false,
        connectionStatus: "INITIATED",
        healthScore: 0,
        lastSuccessfulSync: null,
        lastHealthCheck: null,
        lastFailureReason: null,
      });
    }

    return res.json({
      success: true,
      connected: client.isActive,
      connectionStatus: client.connectionStatus || "INITIATED",
      healthScore: client.healthScore ?? 100,
      lastSuccessfulSync: client.lastSuccessfulSync,
      lastHealthCheck: client.lastHealthCheck,
      lastFailureReason: client.lastFailureReason,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch Instagram status",
      error: error.message,
    });
  }
};

export const getInstagramHealth = async (req: any, res: any) => {
  try {
    const businessId = await getBusinessIdForRequest(req);
    if (!businessId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const client = await prisma.client.findFirst({
      where: {
        businessId,
        platform: "INSTAGRAM",
        deletedAt: null,
      },
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Instagram connection not found",
      });
    }

    const force = req.query.force === "true";
    let healthResult: any;

    if (force || !client.lastHealthCheck || Date.now() - new Date(client.lastHealthCheck).getTime() > 10 * 60 * 1000) {
      if (force) {
        healthResult = await InstagramConnectionHealthService.evaluateHealth(client.id);
      } else {
        InstagramConnectionHealthService.evaluateHealth(client.id).catch(() => undefined);
        healthResult = {
          clientId: client.id,
          businessId: client.businessId,
          platform: "INSTAGRAM",
          isActive: client.isActive,
          healthScore: client.healthScore ?? 100,
          status: client.connectionStatus || "Healthy",
          lastChecked: client.lastHealthCheck ? client.lastHealthCheck.toISOString() : new Date().toISOString(),
          metrics: {
            tokenHealth: client.connectionStatus === "Invalid" || client.connectionStatus === "Expired" ? 0 : 100,
            webhookHealth: client.lastFailureReason?.includes("webhook") ? 0 : 100,
            permissionHealth: client.lastFailureReason?.includes("permission") ? 50 : 100,
            apiAvailability: 100,
            messageDeliveryHealth: 100,
            workerHealth: 100,
          },
          issues: client.lastFailureReason ? client.lastFailureReason.split("; ") : [],
          recommendedActions: client.lastFailureReason ? ["Reconnect Instagram to restore access"] : [],
        };
      }
    } else {
      healthResult = {
        clientId: client.id,
        businessId: client.businessId,
        platform: "INSTAGRAM",
        isActive: client.isActive,
        healthScore: client.healthScore ?? 100,
        status: client.connectionStatus || "Healthy",
        lastChecked: client.lastHealthCheck.toISOString(),
        metrics: {
          tokenHealth: client.connectionStatus === "Invalid" || client.connectionStatus === "Expired" ? 0 : 100,
          webhookHealth: client.lastFailureReason?.includes("webhook") ? 0 : 100,
          permissionHealth: client.lastFailureReason?.includes("permission") ? 50 : 100,
          apiAvailability: 100,
          messageDeliveryHealth: 100,
          workerHealth: 100,
        },
        issues: client.lastFailureReason ? client.lastFailureReason.split("; ") : [],
        recommendedActions: client.lastFailureReason ? ["Reconnect Instagram to resolve issues"] : [],
      };
    }

    return res.json({
      success: true,
      data: healthResult,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch Instagram health score",
      error: error.message,
    });
  }
};

export const getInstagramHistory = async (req: any, res: any) => {
  try {
    const businessId = await getBusinessIdForRequest(req);
    if (!businessId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const history = await prisma.connectionAttemptLedger.findMany({
      where: {
        tenantKey: businessId,
        provider: "INSTAGRAM",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
    });

    return res.json({
      success: true,
      history: history.map((h) => {
        const meta = h.metadata && typeof h.metadata === "object" ? (h.metadata as any) : {};
        return {
          attemptKey: h.attemptKey,
          stage: h.step,
          status: h.status,
          detail: h.statusDetail,
          errorCode: h.errorCode,
          errorMessage: h.errorMessage,
          resolutionHint: h.resolutionHint,
          createdAt: h.createdAt,
          timeline: meta.history || [],
        };
      }),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch Instagram connection history",
      error: error.message,
    });
  }
};

export const reconnectInstagram = async (req: any, res: any) => {
  try {
    const businessId = await getBusinessIdForRequest(req);
    if (!businessId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const client = await prisma.client.findFirst({
      where: {
        businessId,
        platform: "INSTAGRAM",
        deletedAt: null,
      },
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Instagram connection not found to reconnect",
      });
    }

    const lastIssue = client.lastFailureReason || "webhook";
    const recovery = await InstagramConnectionHealthService.attemptSelfRecovery(client.id, lastIssue);

    return res.json({
      success: recovery.success,
      message: recovery.message,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Failed to reconnect / self-recover Instagram",
      error: error.message,
    });
  }
};
