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
} from "../services/webhookSecurity.service";

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
    | "webhook_queue_failure",
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

const enforceWebhookSecurity = async (req: Request, body: any) => {
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

  if (!isWebhookTimestampFresh(timestampMs)) {
    return false;
  }

  const replaySignature = Array.isArray(signature) ? signature[0] : signature;

  if (timestampMs && replaySignature) {
    const accepted = await guardWebhookReplay({
      platform: "WHATSAPP",
      signature: String(replaySignature),
      timestampMs,
    });

    if (!accepted) {
      return false;
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

  const sendWebhookResponse = (statusCode: number, reason?: string) => {
    const ingestMs = Math.max(0, Date.now() - startedAt);
    emitWebhookMetric("webhook_ingest_ms", ingestMs, {
      statusCode,
      enqueuedJobs,
      dedupedEvents,
      reason: reason || null,
    });
    emitWebhookMetric("webhook_post_response_work", 0, {
      statusCode,
    });
    if (ingestMs > WEBHOOK_RUNTIME_BUDGET_MS) {
      emitWebhookMetric("webhook_runtime_budget_exceeded", ingestMs, {
        thresholdMs: WEBHOOK_RUNTIME_BUDGET_MS,
        statusCode,
      });
    }
    return res.sendStatus(statusCode);
  };

  try {
    const body = parseBody(req);

    if (!(await enforceWebhookSecurity(req, body))) {
      return sendWebhookResponse(403, "security_rejected");
    }

    const requestId = String(req.requestId || "").trim() || null;
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

    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const eventId = normalizeIdentifier(message?.id);
    if (eventId) {
      const shouldProcess = await processWebhookEvent({
        eventId,
        platform: "WHATSAPP",
      });

      if (!shouldProcess) {
        dedupedEvents += 1;
        emitWebhookMetric("webhook_deduped", 1, {
          webhookTask: "message_intake",
          eventId,
        });
        if (process.env.WEBHOOK_DEDUP_ENABLED !== "false") {
          emitWebhookMetric("webhook_dedup_hit", 1, {
            webhookTask: "message_intake",
            eventId,
          });
        }
        return sendWebhookResponse(200, "duplicate_message");
      } else {
        if (process.env.WEBHOOK_DEDUP_ENABLED !== "false") {
          emitWebhookMetric("webhook_dedup_miss", 1, {
            webhookTask: "message_intake",
            eventId,
          });
        }
      }
    }

    const from = normalizeIdentifier(message?.from);
    const phoneNumberId = normalizeIdentifier(
      body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id
    );
    const phoneNumberIds = [phoneNumberId].filter(
      (value): value is string => Boolean(value)
    );
    const intakePayload = {
      ...body.entry?.[0]?.changes?.[0]?.value,
      receivedAt: new Date().toISOString(),
    } as Record<string, unknown>;

    if (deliveryProviderMessageIds.length) {
      const enqueueStartedAt = Date.now();
      try {
        await enqueueProviderDeliveryReconcileJob({
          provider: "WHATSAPP",
          traceId: requestId,
          requestId,
          providerMessageIds: deliveryProviderMessageIds,
          deliveredAtIso: new Date().toISOString(),
        });
        emitWebhookMetric(
          "enqueue_ms",
          Math.max(0, Date.now() - enqueueStartedAt),
          {
            webhookTask: "delivery_reconcile",
            deliveryCount: deliveryProviderMessageIds.length,
          }
        );
        enqueuedJobs += 1;
      } catch (error) {
        emitWebhookMetric("webhook_degraded", 1, {
          webhookTask: "delivery_reconcile",
          reason: "enqueue_failed",
          error: String(
            (error as { message?: unknown })?.message || error || "enqueue_failed"
          ),
        });
        emitWebhookMetric("webhook_queue_failure", 1, {
          webhookTask: "delivery_reconcile",
        });
      }
    }

    if (from && phoneNumberIds.length && message) {
      const enqueueStartedAt = Date.now();
      try {
        await enqueueWhatsAppMessageIngestJob({
          requestId,
          eventId,
          from,
          phoneNumberIds,
          eventTimestampMs: toEpochMs(message?.timestamp || body?.entry?.[0]?.time),
          intakePayload,
        });
      } catch (error) {
        if (eventId) {
          await rollbackWebhookEvent({
            eventId,
            platform: "WHATSAPP",
          }).catch(() => undefined);
        }

        emitWebhookMetric("webhook_degraded", 1, {
          webhookTask: "message_intake",
          reason: "enqueue_failed",
          eventId: eventId || null,
          error: String(
            (error as { message?: unknown })?.message || error || "enqueue_failed"
          ),
        });
        emitWebhookMetric("webhook_queue_failure", 1, {
          webhookTask: "message_intake",
          eventId: eventId || null,
        });
        return sendWebhookResponse(503, "message_enqueue_failed");
      }

      emitWebhookMetric(
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
    req.logger?.error({ error }, "WhatsApp webhook error");
    captureExceptionWithContext(error, {
      tags: {
        webhook: "whatsapp",
      },
    });

    return sendWebhookResponse(500, "unhandled_error");
  }
});

export default router;
