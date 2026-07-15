import axios from "axios";
import prisma from "../config/prisma";
import { decrypt } from "../utils/encrypt";
import {
  recordMetricSnapshot,
  recordObservabilityEvent,
} from "./reliability/reliabilityOS.service";
import { axiosWithMetaRetry } from "../utils/metaRetry";
import logger from "../utils/logger";
import { isRedisCircuitOpen } from "../redis/redisSafety";

export type ConnectionHealthClient = {
  id: string;
  platform: string;
  accessToken: string;
  isActive?: boolean | null;
};

export interface InstagramHealthResult {
  clientId: string;
  businessId: string;
  platform: "INSTAGRAM";
  isActive: boolean;
  healthScore: number;
  status: "Healthy" | "Expiring Soon" | "Expired" | "Invalid" | "Degraded";
  lastChecked: string;
  metrics: {
    tokenHealth: number;
    webhookHealth: number;
    permissionHealth: number;
    apiAvailability: number;
    messageDeliveryHealth: number;
    workerHealth: number;
  };
  issues: string[];
  recommendedActions: string[];
  lastSuccessfulSync?: string | null;
  lastFailureReason?: string | null;
}

const getMetaAppToken = () => {
  const appId = String(process.env.META_APP_ID || "").trim();
  const appSecret = String(process.env.META_APP_SECRET || "").trim();

  if (!appId || !appSecret) {
    return null;
  }

  return `${appId}|${appSecret}`;
};

const getMetaErrorMessage = (error: any) =>
  error?.response?.data?.error?.message ||
  error?.response?.data?.message ||
  error?.message ||
  "Unknown error";

const isExpiredTimestamp = (value: unknown) => {
  const expiresAt = Number(value || 0);

  return expiresAt > 0 && expiresAt * 1000 <= Date.now();
};

const isMetaAuthFailure = (error: any) => {
  const status = Number(error?.response?.status || 0);
  const code = Number(error?.response?.data?.error?.code || 0);
  const message = getMetaErrorMessage(error).toLowerCase();

  if (code === 190 || status === 401) {
    return true;
  }

  if (
    (status === 400 || status === 403) &&
    /(token|expired|permission|session|invalid|authorization)/i.test(message)
  ) {
    return true;
  }

  return false;
};

const logInactiveConnection = (client: ConnectionHealthClient) => {
  console.warn("Token invalid", {
    clientId: client.id,
    platform: client.platform,
  });
  console.warn("Connection lost", {
    clientId: client.id,
    platform: client.platform,
  });
  console.warn("Connection inactive", {
    clientId: client.id,
    platform: client.platform,
  });
};

const markClientInactive = async (client: ConnectionHealthClient) => {
  if (client.isActive === false) {
    return;
  }

  await prisma.client.update({
    where: { id: client.id },
    data: {
      isActive: false,
    },
  });

  logInactiveConnection(client);
  await recordMetricSnapshot({
    subsystem: "PROVIDERS",
    queueLag: 0,
    workerUtilization: 0,
    dlqRate: 0,
    retryRate: 0.25,
    lockContention: 0,
    providerErrorRate: 1,
    metadata: {
      platform: client.platform,
      clientId: client.id,
      reason: "auth_failed_or_expired",
    },
  }).catch(() => undefined);
  await recordObservabilityEvent({
    eventType: "provider.connection.inactive",
    message: `${client.platform} connection marked inactive`,
    severity: "error",
    context: {
      provider: client.platform,
      component: "providers",
      phase: "health",
    },
    metadata: {
      clientId: client.id,
    },
  }).catch(() => undefined);
};

const validateWithDebugToken = async (accessToken: string) => {
  const appToken = getMetaAppToken();

  if (!appToken) {
    return null;
  }

  const response = await axios.get(
    "https://graph.facebook.com/v19.0/debug_token",
    {
      params: {
        input_token: accessToken,
        access_token: appToken,
      },
      timeout: 10000,
    }
  );

  const tokenData = response.data?.data;

  if (!tokenData) {
    return null;
  }

  if (!tokenData.is_valid || isExpiredTimestamp(tokenData.expires_at)) {
    return false;
  }

  return true;
};

const validateWithSimpleRequest = async (accessToken: string) => {
  await axios.get("https://graph.facebook.com/v19.0/me", {
    params: {
      fields: "id",
      access_token: accessToken,
    },
    timeout: 10000,
  });

  return true;
};

export async function checkConnectionHealth(client: ConnectionHealthClient) {
  if (!client) {
    return false;
  }

  if (client.isActive === false) {
    return false;
  }

  let accessToken = "";

  try {
    accessToken = decrypt(client.accessToken || "").trim();
  } catch {
    await markClientInactive(client);
    return false;
  }

  if (!accessToken) {
    await markClientInactive(client);
    return false;
  }

  try {
    const debugResult = await validateWithDebugToken(accessToken);

    if (debugResult === true) {
      return true;
    }

    if (debugResult === false) {
      await markClientInactive(client);
      return false;
    }
  } catch {
    // Fall back to a lightweight Graph request if debug_token is unavailable.
  }

  try {
    await validateWithSimpleRequest(accessToken);
    return true;
  } catch (error: any) {
    if (isMetaAuthFailure(error)) {
      await markClientInactive(client);
      return false;
    }

    return true;
  }
}

export const subscribeInstagramPageWebhook = async (
  facebookPageId: string,
  pageAccessToken: string
): Promise<boolean> => {
  if (!facebookPageId || !pageAccessToken) {
    return false;
  }
  try {
    await axiosWithMetaRetry({
      method: "POST",
      url: `https://graph.facebook.com/v19.0/${facebookPageId}/subscribed_apps`,
      data: null,
      params: {
        subscribed_fields: "messages,messaging_postbacks,comments",
        access_token: pageAccessToken,
      },
      timeout: 12000,
    }, "HEALTH_WEBHOOK_SUBSCRIBE");
    return true;
  } catch (error: any) {
    logger.error({
      message: "Webhook subscription failed during self recovery",
      facebookPageId,
      error: error.message,
    });
    return false;
  }
};

export class InstagramConnectionHealthService {
  public static async evaluateHealth(clientId: string): Promise<InstagramHealthResult> {
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        platform: "INSTAGRAM",
        deletedAt: null,
      },
    });

    if (!client) {
      throw new Error(`Instagram client connection not found: ${clientId}`);
    }

    const result: InstagramHealthResult = {
      clientId: client.id,
      businessId: client.businessId,
      platform: "INSTAGRAM",
      isActive: client.isActive,
      healthScore: 100,
      status: "Healthy",
      lastChecked: new Date().toISOString(),
      metrics: {
        tokenHealth: 100,
        webhookHealth: 100,
        permissionHealth: 100,
        apiAvailability: 100,
        messageDeliveryHealth: 100,
        workerHealth: 100,
      },
      issues: [],
      recommendedActions: [],
      lastSuccessfulSync: client.lastSuccessfulSync ? client.lastSuccessfulSync.toISOString() : null,
      lastFailureReason: client.lastFailureReason || null,
    };

    // 1. Decrypt token & check token health
    let accessToken = "";
    try {
      accessToken = decrypt(client.accessToken || "").trim();
    } catch (e) {
      result.metrics.tokenHealth = 0;
      result.issues.push("Token decryption failed. Token is corrupted in database.");
      result.recommendedActions.push("Reconnect Instagram to re-authorize and restore connection.");
    }

    if (!accessToken && result.metrics.tokenHealth > 0) {
      result.metrics.tokenHealth = 0;
      result.issues.push("Access token is missing in database.");
      result.recommendedActions.push("Reconnect Instagram to re-authorize.");
    }

    let facebookPageId = "";

    if (accessToken) {
      // Check Meta API availability & Token health
      try {
        // Resolve page identity first
        const meRes = await axiosWithMetaRetry({
          method: "GET",
          url: "https://graph.facebook.com/v19.0/me",
          params: {
            fields: "id,name",
            access_token: accessToken,
          },
          timeout: 8000,
        }, "HEALTH_CHECK_ME");

        facebookPageId = meRes.data?.id || "";

        // Check debug token if app credentials exist
        const appToken = getMetaAppToken();
        if (appToken) {
          try {
            const debugRes = await axiosWithMetaRetry({
              method: "GET",
              url: "https://graph.facebook.com/v19.0/debug_token",
              params: {
                input_token: accessToken,
                access_token: appToken,
              },
              timeout: 8000,
            }, "HEALTH_CHECK_DEBUG_TOKEN");

            const data = debugRes.data?.data;
            if (data) {
              if (!data.is_valid) {
                result.metrics.tokenHealth = 0;
                result.issues.push("Token is marked invalid by Meta.");
                result.recommendedActions.push("Reconnect Instagram to re-authorize.");
              } else if (data.expires_at > 0) {
                const expiresAtMs = data.expires_at * 1000;
                const msRemaining = expiresAtMs - Date.now();
                if (msRemaining <= 0) {
                  result.metrics.tokenHealth = 0;
                  result.issues.push("Long-lived page access token has expired.");
                  result.recommendedActions.push("Reconnect Instagram to refresh token.");
                } else if (msRemaining < 7 * 24 * 60 * 60 * 1000) { // < 7 days
                  result.metrics.tokenHealth = 80;
                  result.issues.push(`Token will expire in ${Math.round(msRemaining / (24 * 60 * 60 * 1000))} days.`);
                  result.recommendedActions.push("Reconnect Instagram soon to renew the authorization.");
                }
              }
            }
          } catch (debugErr) {
            // debug_token failed, skip app validation
          }
        }
      } catch (err: any) {
        result.metrics.apiAvailability = 0;
        result.issues.push(`Meta Graph API call failed: ${err.message}`);
        
        if (isMetaAuthFailure(err)) {
          result.metrics.tokenHealth = 0;
          result.issues.push("Meta authentication failed. Session might be revoked or password changed.");
          result.recommendedActions.push("Reconnect Instagram to restore the connection.");
        } else {
          result.recommendedActions.push("Wait for Meta services to restore availability.");
        }
      }
    } else {
      result.metrics.apiAvailability = 0;
    }

    // 2. Webhook Health
    if (accessToken && facebookPageId) {
      try {
        const subRes = await axiosWithMetaRetry({
          method: "GET",
          url: `https://graph.facebook.com/v19.0/${facebookPageId}/subscribed_apps`,
          params: {
            access_token: accessToken,
          },
          timeout: 8000,
        }, "HEALTH_CHECK_SUBSCRIBED_APPS");

        const apps = subRes.data?.data || [];
        const appId = String(process.env.META_APP_ID || "").trim();
        const appSubscription = apps.find((app: any) => app.id === appId || !appId);

        if (!appSubscription) {
          result.metrics.webhookHealth = 0;
          result.issues.push("App is not subscribed to the Facebook page events.");
          result.recommendedActions.push("Trigger webhook automatic recovery or reconnect Instagram.");
        } else {
          const fields = appSubscription.subscribed_fields || [];
          const requiredFields = ["messages", "messaging_postbacks", "comments"];
          const missingFields = requiredFields.filter(f => !fields.includes(f));
          if (missingFields.length > 0) {
            result.metrics.webhookHealth = 50;
            result.issues.push(`Webhook subscription is missing fields: ${missingFields.join(", ")}`);
            result.recommendedActions.push("Trigger webhook automatic recovery to restore missing events.");
          }
        }
      } catch (err: any) {
        result.metrics.webhookHealth = 0;
        result.issues.push(`Failed to verify webhook subscriptions: ${err.message}`);
        result.recommendedActions.push("Trigger webhook automatic recovery.");
      }
    } else {
      result.metrics.webhookHealth = 0;
    }

    // 3. Permission Health
    if (accessToken) {
      try {
        const permRes = await axiosWithMetaRetry({
          method: "GET",
          url: "https://graph.facebook.com/v19.0/me/permissions",
          params: {
            access_token: accessToken,
          },
          timeout: 8000,
        }, "HEALTH_CHECK_PERMISSIONS");

        const perms = permRes.data?.data || [];
        const granted = perms
          .filter((p: any) => p.status === "granted")
          .map((p: any) => p.permission);

        const requiredPermissions = [
          "instagram_basic",
          "instagram_manage_messages",
          "pages_manage_metadata",
          "pages_show_list",
        ];
        const missing = requiredPermissions.filter(p => !granted.includes(p));

        if (missing.length > 0) {
          result.metrics.permissionHealth = Math.max(0, 100 - (missing.length / requiredPermissions.length) * 100);
          result.issues.push(`Missing required Meta permissions: ${missing.join(", ")}`);
          result.recommendedActions.push("Reconnect Instagram and verify all requested permissions are approved.");
        }
      } catch (err: any) {
        result.metrics.permissionHealth = 0;
        result.issues.push(`Failed to verify account permissions: ${err.message}`);
      }
    } else {
      result.metrics.permissionHealth = 0;
    }

    // 4. Message Delivery Health
    try {
      const past24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const totalMessages = await prisma.salesMessageTracking.count({
        where: {
          clientId: client.id,
          sentAt: { gte: past24h },
        },
      });

      result.metrics.messageDeliveryHealth = 100;

      if (totalMessages > 0 && result.metrics.apiAvailability === 0) {
        // Degrade message delivery health if Meta API is down
        result.metrics.messageDeliveryHealth = 0;
        result.issues.push("Message delivery is blocked because Meta API is unreachable.");
      }
    } catch (e) {
      // ignore
    }

    // 5. Worker Health
    const queueCircuitOpen = isRedisCircuitOpen();
    if (queueCircuitOpen) {
      result.metrics.workerHealth = 0;
      result.issues.push("Redis queue circuit breaker is open. Background worker is disabled.");
      result.recommendedActions.push("Check platform infrastructure or redis health.");
    }

    // 6. Overall Health Score & Status
    if (result.metrics.tokenHealth === 0) {
      result.healthScore = 0;
      result.status = "Invalid";
    } else {
      const score = 
        (result.metrics.tokenHealth * 0.35) +
        (result.metrics.webhookHealth * 0.25) +
        (result.metrics.permissionHealth * 0.20) +
        (result.metrics.apiAvailability * 0.10) +
        (result.metrics.messageDeliveryHealth * 0.05) +
        (result.metrics.workerHealth * 0.05);
      
      result.healthScore = Math.max(0, Math.min(100, Math.round(score)));

      if (result.healthScore >= 90) {
        result.status = "Healthy";
      } else if (result.metrics.tokenHealth === 80) {
        result.status = "Expiring Soon";
      } else if (result.healthScore >= 60) {
        result.status = "Degraded";
      } else {
        result.status = "Expired";
      }
    }

    // Update DB with cached stats
    await prisma.client.update({
      where: { id: client.id },
      data: {
        healthScore: result.healthScore,
        connectionStatus: result.status,
        lastHealthCheck: new Date(),
        lastFailureReason: result.issues.join("; ") || null,
      },
    }).catch(() => undefined);

    return result;
  }

  public static async runAutomaticTokenHealthCheck(): Promise<void> {
    const clients = await prisma.client.findMany({
      where: {
        platform: "INSTAGRAM",
        isActive: true,
        deletedAt: null,
      },
    });

    for (const client of clients) {
      try {
        await this.evaluateHealth(client.id);
      } catch (err: any) {
        logger.error({
          message: "Automatic health check sweep failed for client",
          clientId: client.id,
          error: err.message,
        });
      }
    }
  }

  public static async attemptSelfRecovery(clientId: string, issue: string): Promise<{ success: boolean; message: string }> {
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        platform: "INSTAGRAM",
        deletedAt: null,
      },
    });

    if (!client) {
      return { success: false, message: "Client connection not found." };
    }

    let accessToken = "";
    try {
      accessToken = decrypt(client.accessToken || "").trim();
    } catch {
      return { success: false, message: "Failed to decrypt token. Connection requires full re-auth." };
    }

    if (!accessToken) {
      return { success: false, message: "Token missing. Connection requires full re-auth." };
    }

    // Webhook recovery workflow
    if (issue.toLowerCase().includes("webhook") || issue.toLowerCase().includes("subscribe")) {
      try {
        const meRes = await axiosWithMetaRetry({
          method: "GET",
          url: "https://graph.facebook.com/v19.0/me",
          params: { fields: "id", access_token: accessToken },
          timeout: 8000,
        }, "RECOVERY_ME");

        const facebookPageId = meRes.data?.id;
        if (!facebookPageId) {
          return { success: false, message: "Failed to resolve Facebook Page ID associated with token." };
        }

        const subscribed = await subscribeInstagramPageWebhook(facebookPageId, accessToken);
        if (subscribed) {
          await prisma.client.update({
            where: { id: client.id },
            data: {
              connectionStatus: "Healthy",
              healthScore: 100,
              lastSuccessfulSync: new Date(),
              lastFailureReason: null,
              recoveryAttempts: { increment: 1 },
            },
          });

          await recordObservabilityEvent({
            eventType: "instagram.recovery.webhook_success",
            message: "Successfully recovered Instagram webhook subscription.",
            severity: "info",
            context: {
              provider: "INSTAGRAM",
              component: "health-engine",
              phase: "recovery",
            },
            metadata: { clientId: client.id, facebookPageId },
          });

          return { success: true, message: "Webhook subscription re-established successfully." };
        } else {
          return { success: false, message: "Subscription API call failed." };
        }
      } catch (err: any) {
        return { success: false, message: `Webhook recovery failed: ${err.message}` };
      }
    }

    if (issue.toLowerCase().includes("permission")) {
      return { success: false, message: "Permission issues require user re-authorization via reconnect." };
    }

    // Default recovery: run debug and recheck
    try {
      const checkResult = await checkConnectionHealth(client);
      if (checkResult) {
        await prisma.client.update({
          where: { id: client.id },
          data: {
            connectionStatus: "Healthy",
            healthScore: 100,
            lastSuccessfulSync: new Date(),
            lastFailureReason: null,
          },
        });
        return { success: true, message: "Connection verified and restored to Healthy." };
      }
      return { success: false, message: "Connection check failed. Recovery incomplete." };
    } catch (e: any) {
      return { success: false, message: `Recovery check failed: ${e.message}` };
    }
  }
}
