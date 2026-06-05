import { Router, Request, Response } from "express";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import { captureExceptionWithContext } from "../observability/sentry";
import {
  enqueueProviderDeliveryReconcileJob,
  enqueueWhatsAppMessageIngestJob,
} from "../queues/webhookIntake.queue";
import {
  processWebhookEvent,
  rollbackWebhookEvent,
} from "../services/webhookDedup.service";
import {
  extractMetaWebhookTimestamp,
  guardWebhookReplay,
  isWebhookTimestampFresh,
  verifyMetaWebhookSignature,
  deleteReplayKey,
} from "../services/webhookSecurity.service";
import prisma from "../config/prisma";

const router = Router();
const WEBHOOK_RUNTIME_BUDGET_MS = Math.max(
  250,
  Number(process.env.WEBHOOK_RUNTIME_BUDGET_MS || 1200)
);
const isProduction = process.env.NODE_ENV === "production";

const emitWebhookMetric = (
  name:
    | "webhook_ingest_ms"
    | "enqueue_ms"
    | "webhook_post_response_work"
    | "webhook_runtime_budget_exceeded"
    | "webhook_deduped"
    | "webhook_degraded"
    | "webhook_dedup_hit"
    | "webhook_dedup_miss"
    | "webhook_queue_failure"
    | "webhook_replay_detected"
    | "webhook_replay_rejected"
    | "webhook_replay_allowed",
  value: number,
  metadata?: Record<string, unknown>
) => {
  emitPerformanceMetric({
    name: name as any,
    value,
    route: "whatsapp_webhook",
    metadata: {
      provider: "WHATSAPP",
      ...(metadata || {}),
    },
  });
};

const normalizeIdentifier = (value?: unknown) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

const toEpochMs = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return Date.now();
  }
  return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
};

const getSignatureHeader = (req: Request) =>
  req.headers["x-hub-signature-256"] || req.headers["x-hub-signature"];

const parseBody = (req: any) => {
  if (Buffer.isBuffer(req.body)) {
    return JSON.parse(req.body.toString("utf8"));
  }

  throw new Error("Invalid webhook body");
};

const getWhatsAppDeliveryStatuses = (body: any) =>
  Array.isArray(body?.entry)
    ? body.entry.flatMap((entry: any) =>
        Array.isArray(entry?.changes)
          ? entry.changes.flatMap((change: any) =>
              Array.isArray(change?.value?.statuses) ? change.value.statuses : []
            )
          : []
      )
    : [];

const resolveWhatsAppTenantId = async (phoneNumberIds: string[]): Promise<string | null> => {
  if (!phoneNumberIds.length) return null;
  try {
    const client = await prisma.client.findFirst({
      where: {
        OR: phoneNumberIds.map((id) => ({ phoneNumberId: id })),
        isActive: true,
      },
      select: { businessId: true },
    });
    return client?.businessId || null;
  } catch (error) {
    console.error("[RESOLVE TENANT ERROR]", error);
    return null;
  }
};

const enforceWebhookSecurity = async (
  req: Request,
  body: any,
  correlationId: string,
  tenantId: string | null,
  emitRequestWebhookMetric: (name: string, value: number, metadata?: Record<string, unknown>) => void
) => {
  const rawBody = Buffer.isBuffer((req as any).body)
    ? ((req as any).body as Buffer)
    : req.rawBody;
  const signature = getSignatureHeader(req);
  const secret = process.env.META_APP_SECRET?.trim() || null;

  if (
    (isProduction || secret) &&
    (!rawBody ||
      !verifyMetaWebhookSignature({
        rawBody,
        signature,
        secret,
      }))
  ) {
    return false;
  }

  const timestampMs = extractMetaWebhookTimestamp(body);
  const replaySignature = Array.isArray(signature) ? signature[0] : signature;

  if (timestampMs) {
    const isFresh = isWebhookTimestampFresh(timestampMs);
    let isUnique = true;

    if (isFresh && replaySignature) {
      isUnique = await guardWebhookReplay({
        platform: "WHATSAPP",
        signature: String(replaySignature),
        timestampMs,
      });
    }

    const replayDetected = !isFresh || !isUnique;

    if (replayDetected) {
      emitRequestWebhookMetric("webhook_replay_detected", 1, {
        isFresh,
        isUnique,
        timestampMs,
        replaySignature,
      });

      const isReplayProtectionEnabled =
        process.env.WEBHOOK_REPLAY_PROTECTION_ENABLED !== "false";

      if (isReplayProtectionEnabled) {
        emitRequestWebhookMetric("webhook_replay_rejected", 1, {
          isFresh,
          isUnique,
          timestampMs,
          replaySignature,
        });
        return false;
      } else {
        emitRequestWebhookMetric("webhook_replay_allowed", 1, {
          isFresh,
          isUnique,
          timestampMs,
          replaySignature,
        });
      }
    }
  }

  return true;
};

router.get("/", (req: Request, res: Response) => {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

router.post("/", async (req: any, res: Response) => {
  const startedAt = Date.now();
  let enqueuedJobs = 0;
  let dedupedEvents = 0;

  let body: any;
  try {
    body = parseBody(req);
  } catch (error) {
    req.logger?.error({ error }, "WhatsApp webhook body parse failed");
    return res.sendStatus(400);
  }

  const correlationId = String(
    req.headers["x-correlation-id"] ||
      req.correlationId ||
      req.requestId ||
      crypto.randomUUID()
  );
  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const eventId = normalizeIdentifier(message?.id);
  const traceId = `webhook_whatsapp_${eventId || correlationId}`;

  const phoneNumberId = normalizeIdentifier(
    body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id
  );
  const phoneNumberIds = [phoneNumberId].filter(
    (value): value is string => Boolean(value)
  );

  const tenantId = await resolveWhatsAppTenantId(phoneNumberIds);

  const requestLogger = req.logger
    ? req.logger.child({ correlationId, traceId, tenantId, eventId })
    : null;

  const emitRequestWebhookMetric = (
    name: string,
    value: number,
    metadata?: Record<string, unknown>
  ) => {
    emitPerformanceMetric({
      name: name as any,
      value,
      businessId: tenantId,
      route: "whatsapp_webhook",
      metadata: {
        provider: "WHATSAPP",
        correlationId,
        traceId,
        tenantId,
        eventId,
        ...(metadata || {}),
      },
    });
  };

  const sendWebhookResponse = (statusCode: number, reason?: string) => {
    const ingestMs = Math.max(0, Date.now() - startedAt);
    emitRequestWebhookMetric("webhook_ingest_ms", ingestMs, {
      statusCode,
      enqueuedJobs,
      dedupedEvents,
      reason: reason || null,
    });
    emitRequestWebhookMetric("webhook_post_response_work", 0, {
      statusCode,
    });
    if (ingestMs > WEBHOOK_RUNTIME_BUDGET_MS) {
      emitRequestWebhookMetric("webhook_runtime_budget_exceeded", ingestMs, {
        thresholdMs: WEBHOOK_RUNTIME_BUDGET_MS,
        statusCode,
      });
    }
    return res.sendStatus(statusCode);
  };

  try {
    if (
      !(await enforceWebhookSecurity(
        req,
        body,
        correlationId,
        tenantId,
        emitRequestWebhookMetric
      ))
    ) {
      return sendWebhookResponse(403, "security_rejected");
    }

    const deliveryStatuses = getWhatsAppDeliveryStatuses(body);
    const deliveryProviderMessageIds = deliveryStatuses
      .map((status) => ({
        providerMessageId: normalizeIdentifier(status?.id || status?.message_id),
        deliveryStatus: String(status?.status || "").trim().toLowerCase(),
      }))
      .filter(
        (status): status is { providerMessageId: string; deliveryStatus: string } =>
          Boolean(status.providerMessageId) &&
          ["sent", "delivered", "read"].includes(status.deliveryStatus)
      )
      .map((status) => status.providerMessageId);

    if (eventId) {
      const shouldProcess = await processWebhookEvent({
        eventId,
        platform: "WHATSAPP",
        correlationId,
        tenantId,
      });

      if (!shouldProcess) {
        dedupedEvents += 1;
        emitRequestWebhookMetric("webhook_deduped", 1, {
          webhookTask: "message_intake",
          eventId,
        });
        if (process.env.WEBHOOK_DEDUP_ENABLED !== "false") {
          emitRequestWebhookMetric("webhook_dedup_hit", 1, {
            webhookTask: "message_intake",
            eventId,
          });
        }
        return sendWebhookResponse(200, "duplicate_message");
      } else {
        if (process.env.WEBHOOK_DEDUP_ENABLED !== "false") {
          emitRequestWebhookMetric("webhook_dedup_miss", 1, {
            webhookTask: "message_intake",
            eventId,
          });
        }
      }
    }

    const from = normalizeIdentifier(message?.from);
    const intakePayload = {
      ...body.entry?.[0]?.changes?.[0]?.value,
      receivedAt: new Date().toISOString(),
    } as Record<string, unknown>;

    if (deliveryProviderMessageIds.length) {
      const enqueueStartedAt = Date.now();
      try {
        await enqueueProviderDeliveryReconcileJob({
          provider: "WHATSAPP",
          traceId: traceId,
          requestId: correlationId,
          providerMessageIds: deliveryProviderMessageIds,
          deliveredAtIso: new Date().toISOString(),
          correlationId,
          tenantId,
        } as any);
        emitRequestWebhookMetric(
          "enqueue_ms",
          Math.max(0, Date.now() - enqueueStartedAt),
          {
            webhookTask: "delivery_reconcile",
            deliveryCount: deliveryProviderMessageIds.length,
          }
        );
        enqueuedJobs += 1;
      } catch (error) {
        emitRequestWebhookMetric("webhook_degraded", 1, {
          webhookTask: "delivery_reconcile",
          reason: "enqueue_failed",
          error: String(
            (error as { message?: unknown })?.message || error || "enqueue_failed"
          ),
        });
        emitRequestWebhookMetric("webhook_queue_failure", 1, {
          webhookTask: "delivery_reconcile",
        });
      }
    }

    if (from && phoneNumberIds.length && message) {
      const enqueueStartedAt = Date.now();
      try {
        await enqueueWhatsAppMessageIngestJob({
          requestId: correlationId,
          eventId,
          from,
          phoneNumberIds,
          eventTimestampMs: toEpochMs(message?.timestamp || body?.entry?.[0]?.time),
          intakePayload,
          correlationId,
          tenantId,
        } as any);
      } catch (error) {
        if (eventId) {
          await rollbackWebhookEvent({
            eventId,
            platform: "WHATSAPP",
            correlationId,
            tenantId,
          }).catch(() => undefined);
        }

        const timestampMs = extractMetaWebhookTimestamp(body);
        const signature = getSignatureHeader(req);
        const replaySignature = Array.isArray(signature) ? signature[0] : signature;
        if (timestampMs && replaySignature) {
          await deleteReplayKey({
            platform: "WHATSAPP",
            signature: String(replaySignature),
            timestampMs,
          }).catch(() => undefined);
        }

        emitRequestWebhookMetric("webhook_degraded", 1, {
          webhookTask: "message_intake",
          reason: "enqueue_failed",
          eventId: eventId || null,
          error: String(
            (error as { message?: unknown })?.message || error || "enqueue_failed"
          ),
        });
        emitRequestWebhookMetric("webhook_queue_failure", 1, {
          webhookTask: "message_intake",
          eventId: eventId || null,
        });
        return sendWebhookResponse(503, "message_enqueue_failed");
      }

      emitRequestWebhookMetric(
        "enqueue_ms",
        Math.max(0, Date.now() - enqueueStartedAt),
        {
          webhookTask: "message_intake",
          eventId: eventId || null,
        }
      );
      enqueuedJobs += 1;
    }

    return sendWebhookResponse(200, "accepted");
  } catch (error) {
    if (requestLogger) {
      requestLogger.error({ error }, "WhatsApp webhook error");
    } else {
      console.error(
        `[WhatsApp Webhook Error] [correlationId=${correlationId}]`,
        error
      );
    }
    captureExceptionWithContext(error, {
      tags: {
        webhook: "whatsapp",
        correlationId,
      },
    });

    return sendWebhookResponse(500, "unhandled_error");
  }
});

export default router;
