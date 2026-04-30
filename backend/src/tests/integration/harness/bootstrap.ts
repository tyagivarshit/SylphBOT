import crypto from "crypto";
import express from "express";
import http from "http";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { IntegrationEnvironment } from "./env";
import type {
  IntegrationHarness,
  IntegrationTenantFixture,
  IntegrationWebhookMessageInput,
} from "./types";

type RuntimeHandle = {
  harness: IntegrationHarness;
  shutdown: () => Promise<void>;
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const toErrorMessage = (error: unknown) =>
  String((error as { message?: unknown })?.message || error || "unknown_error");

const buildWebhookPayload = ({
  pageId,
  senderId,
  messageId,
  messageText,
  timestampMs = Date.now(),
}: IntegrationWebhookMessageInput) => ({
  object: "instagram",
  entry: [
    {
      id: pageId,
      time: Math.floor(timestampMs / 1000),
      messaging: [
        {
          sender: {
            id: senderId,
          },
          recipient: {
            id: pageId,
          },
          timestamp: timestampMs,
          message: {
            mid: messageId,
            text: messageText,
          },
        },
      ],
    },
  ],
});

const signWebhookPayload = (body: string, secret: string) =>
  `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;

const buildBypassHeaders = ({
  userId,
  businessId,
}: {
  userId: string;
  businessId: string;
}) => ({
  "x-test-user-id": userId,
  "x-test-business-id": businessId,
  "x-test-user-role": "OWNER",
});

export const createIntegrationRuntime = async (
  environment: IntegrationEnvironment
): Promise<RuntimeHandle> => {
  const [
    { default: app },
    lifecycle,
    prismaModule,
    redisModule,
    receptionWorkerModule,
    resolutionServiceModule,
    inboundSlaMonitorModule,
    revenueBrainEventBusModule,
  ] = await Promise.all([
    import("../../../app"),
    import("../../../runtime/lifecycle"),
    import("../../../config/prisma"),
    import("../../../config/redis"),
    import("../../../workers/receptionRuntime.worker"),
    import("../../../services/interactionResolution.service"),
    import("../../../services/inboundSlaMonitor.service"),
    import("../../../services/revenueBrain/eventBus.service"),
  ]);

  lifecycle.initRedis();
  lifecycle.initQueues();
  lifecycle.initWorkers({
    receptionRuntime: true,
    revenueBrainEvents: true,
  });

  const prisma = prismaModule.default as PrismaClient;
  const {
    getSharedRedisConnection,
  } = redisModule;
  const {
    closeReceptionRuntimeWorkers,
    initReceptionRuntimeWorkers,
  } = receptionWorkerModule;
  const { createInteractionResolutionService } = resolutionServiceModule;
  const { runInboundSlaMonitorAsLeader } = inboundSlaMonitorModule;
  const {
    queueRevenueBrainEventDurably,
  } = revenueBrainEventBusModule;

  const resolutionService = createInteractionResolutionService();
  const integrationApp = express();
  const integrationRouter = express.Router();

  integrationRouter.use(express.json({ limit: "1mb" }));

  integrationRouter.post("/interaction/:interactionId/progress", async (req, res) => {
    try {
      const interaction = await resolutionService.startProgress({
        interactionId: String(req.params.interactionId || "").trim(),
        actorId: String(req.body?.actorId || "integration_runner"),
      });

      res.json({
        success: true,
        interactionId: interaction.id,
        lifecycleState: interaction.lifecycleState,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: toErrorMessage(error),
      });
    }
  });

  integrationRouter.post("/interaction/:interactionId/resolve", async (req, res) => {
    try {
      const interaction = await resolutionService.resolve({
        interactionId: String(req.params.interactionId || "").trim(),
        resolutionCode:
          typeof req.body?.resolutionCode === "string"
            ? req.body.resolutionCode
            : "RESOLVED_BY_TEST",
        resolutionScore:
          typeof req.body?.resolutionScore === "number"
            ? req.body.resolutionScore
            : 90,
        actorId: String(req.body?.actorId || "integration_runner"),
      });

      res.json({
        success: true,
        interactionId: interaction.id,
        lifecycleState: interaction.lifecycleState,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: toErrorMessage(error),
      });
    }
  });

  integrationRouter.post("/interaction/:interactionId/reopen", async (req, res) => {
    try {
      const interaction = await resolutionService.reopen({
        interactionId: String(req.params.interactionId || "").trim(),
        reason:
          typeof req.body?.reason === "string" ? req.body.reason : "integration_reopen",
        actorId: String(req.body?.actorId || "integration_runner"),
      });

      res.json({
        success: true,
        interactionId: interaction.id,
        lifecycleState: interaction.lifecycleState,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: toErrorMessage(error),
      });
    }
  });

  integrationRouter.post("/sla/run", async (req, res) => {
    try {
      const now =
        typeof req.body?.now === "string" && req.body.now.trim()
          ? new Date(req.body.now)
          : undefined;
      const result = await runInboundSlaMonitorAsLeader({
        ...(now ? { now } : {}),
      });

      res.json({
        success: true,
        result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: toErrorMessage(error),
      });
    }
  });

  integrationRouter.post("/events/revenue-brain", async (req, res) => {
    try {
      const event =
        typeof req.body?.event === "string"
          ? req.body.event
          : "revenue_brain.delivery_confirmed";
      const payload =
        req.body?.payload && typeof req.body.payload === "object"
          ? req.body.payload
          : {};
      const eventId =
        typeof req.body?.eventId === "string" && req.body.eventId.trim()
          ? req.body.eventId
          : undefined;

      await queueRevenueBrainEventDurably(event as any, payload as any, {
        ...(eventId ? { eventId } : {}),
        requireDurable: true,
      });

      res.status(202).json({
        success: true,
        event,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: toErrorMessage(error),
      });
    }
  });

  integrationApp.use("/__integration__", integrationRouter);
  integrationApp.use(app);
  const server = await new Promise<http.Server>((resolve) => {
    const instance = integrationApp.listen(0, () => resolve(instance));
  });
  const address = server.address();
  const port =
    address && typeof address === "object" ? Number(address.port) : undefined;

  if (!port) {
    throw new Error("Unable to resolve integration server port");
  }

  const baseUrl = `http://127.0.0.1:${port}`;

  const parseJsonBody = (text: string) => {
    if (!text.trim()) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  const httpPost: IntegrationHarness["httpPost"] = async (
    path,
    body,
    options
  ) => {
    const headers: Record<string, string> = {
      ...(options?.headers || {}),
    };
    const rawBody =
      typeof options?.rawBody === "string"
        ? options.rawBody
        : body === undefined
        ? undefined
        : JSON.stringify(body);

    if (!headers["Content-Type"] && !headers["content-type"] && rawBody !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers,
      body: rawBody,
    });
    const text = await response.text();

    return {
      statusCode: response.status,
      text,
      body: parseJsonBody(text),
    };
  };

  const httpGet: IntegrationHarness["httpGet"] = async (path, options) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: options?.headers,
    });
    const text = await response.text();

    return {
      statusCode: response.status,
      text,
      body: parseJsonBody(text),
    };
  };

  const waitFor: IntegrationHarness["waitFor"] = async (
    label,
    resolver,
    options
  ) => {
    const timeoutMs = Math.max(1000, Number(options?.timeoutMs || 20_000));
    const intervalMs = Math.max(25, Number(options?.intervalMs || 150));
    const deadline = Date.now() + timeoutMs;
    let latestError: unknown;

    while (Date.now() <= deadline) {
      try {
        const resolved = await resolver();

        if (resolved !== null) {
          return resolved;
        }
      } catch (error) {
        latestError = error;
      }

      await wait(intervalMs);
    }

    if (latestError) {
      throw new Error(`waitFor(${label}) timeout: ${toErrorMessage(latestError)}`);
    }

    throw new Error(`waitFor(${label}) timeout`);
  };

  const cleanQueueNamespace = async () => {
    try {
      const redis = getSharedRedisConnection();
      let cursor = "0";

      do {
        const scanResult = await redis.scan(
          cursor,
          "MATCH",
          `${environment.queuePrefix}:*`,
          "COUNT",
          "500"
        );
        cursor = String(scanResult?.[0] || "0");
        const keys = Array.isArray(scanResult?.[1]) ? scanResult[1] : [];

        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== "0");
    } catch {
      // Best-effort cleanup. If Redis is unavailable, suites will validate fail-closed behavior.
    }
  };

  const cleanDatabase = async () => {
    await prisma.eventConsumerCheckpoint.deleteMany({});
    await prisma.eventOutbox.deleteMany({});
    await prisma.humanWorkQueue.deleteMany({});
    await prisma.inboundInteraction.deleteMany({});
    await prisma.receptionMemory.deleteMany({});
    await prisma.leadControlState.deleteMany({});
    await prisma.consentLedger.deleteMany({});
    await prisma.revenueTouchLedger.deleteMany({});
    await prisma.webhookEvent.deleteMany({});
    await prisma.leadIntelligenceProfile.deleteMany({});
    await prisma.leadStateHistory.deleteMany({});
    await prisma.conversationSummary.deleteMany({});
    await prisma.memory.deleteMany({});
    await prisma.message.deleteMany({});
    await prisma.lead.deleteMany({});
    await prisma.client.deleteMany({});
    await prisma.usageDaily.deleteMany({});
    await prisma.usage.deleteMany({});
    await prisma.addonBalance.deleteMany({});
    await prisma.revenueRecognitionLedger.deleteMany({});
    await prisma.chargebackLedger.deleteMany({});
    await prisma.refundLedger.deleteMany({});
    await prisma.paymentAttemptLedger.deleteMany({});
    await prisma.invoiceLedger.deleteMany({});
    await prisma.paymentIntentLedger.deleteMany({});
    await prisma.subscriptionLedger.deleteMany({});
    await prisma.signatureLedger.deleteMany({});
    await prisma.contractLedger.deleteMany({});
    await prisma.proposalLedger.deleteMany({});
    await prisma.plan.deleteMany({});
    await prisma.business.deleteMany({});
    await prisma.user.deleteMany({});
  };

  const seedTenant = async (
    input?: Partial<IntegrationTenantFixture>
  ): Promise<IntegrationTenantFixture> => {
    const nowToken = Date.now();
    const suffix = crypto.randomBytes(3).toString("hex");
    const userEmail = `integration.${suffix}.${nowToken}@automexia.test`;
    const user = await prisma.user.create({
      data: {
        name: "Integration Owner",
        email: userEmail,
        password: "integration_password",
        role: "OWNER",
        isActive: true,
        isVerified: true,
      },
    });
    const business = await prisma.business.create({
      data: {
        name: `Integration Business ${suffix}`,
        ownerId: user.id,
      },
    });

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        businessId: business.id,
      },
    });

    const plan = await prisma.plan.upsert({
      where: {
        type: "PRO",
      },
      update: {
        name: "PRO",
        maxAiCalls: 100000,
        maxMessages: 100000,
        maxFollowups: 100000,
      },
      create: {
        name: "PRO",
        type: "PRO",
        maxAiCalls: 100000,
        maxMessages: 100000,
        maxFollowups: 100000,
      },
    });

    const periodStart = new Date();
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.subscriptionLedger.create({
      data: {
        businessId: business.id,
        subscriptionKey: `sub_${suffix}_${nowToken}`,
        status: "ACTIVE",
        provider: "INTERNAL",
        planCode: "PRO",
        billingCycle: "monthly",
        currency: "INR",
        quantity: 1,
        unitPriceMinor: 0,
        amountMinor: 0,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        renewAt: periodEnd,
        metadata: {
          source: "integration_harness_seed",
        } as Prisma.InputJsonValue,
      },
    });

    const pageId = String(input?.pageId || `ig_page_${suffix}`);
    const client = await prisma.client.create({
      data: {
        businessId: business.id,
        platform: "INSTAGRAM",
        pageId,
        accessToken: "integration_access_token",
        isActive: true,
      },
    });

    return {
      userId: String(input?.userId || user.id),
      businessId: String(input?.businessId || business.id),
      clientId: String(input?.clientId || client.id),
      pageId,
      planId: String(input?.planId || plan.id),
    };
  };

  const postInstagramMessageWebhook = async (input: IntegrationWebhookMessageInput) => {
    const payload = buildWebhookPayload(input);
    const rawBody = JSON.stringify(payload);
    const signature = signWebhookPayload(rawBody, environment.webhookSecret);
    const response = await httpPost(
      "/api/webhook/instagram",
      undefined,
      {
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": signature,
        },
        rawBody,
      }
    );

    return {
      statusCode: response.statusCode,
      body: response.body,
    };
  };

  const harness: IntegrationHarness = {
    httpGet,
    httpPost,
    prisma,
    queuePrefix: environment.queuePrefix,
    webhookSecret: environment.webhookSecret,
    seedTenant,
    postInstagramMessageWebhook,
    withBypassHeaders: buildBypassHeaders,
    cleanDatabase,
    cleanQueueNamespace,
    flushAll: async () => {
      await cleanQueueNamespace();
      await cleanDatabase();
    },
    startReceptionWorkers: async () => {
      initReceptionRuntimeWorkers();
    },
    stopReceptionWorkers: async () => {
      await closeReceptionRuntimeWorkers();
    },
    waitFor,
  };

  return {
    harness,
    shutdown: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      await lifecycle.shutdown();
    },
  };
};
