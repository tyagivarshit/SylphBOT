import { Request, Response, Router } from "express";
import crypto from "crypto";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import { captureExceptionWithContext } from "../observability/sentry";
import {
  enqueueInstagramCommentIngestJob,
  enqueueInstagramMessageIngestJob,
  enqueueProviderDeliveryReconcileJob,
} from "../queues/webhookIntake.queue";
import {
  processWebhookEvent,
  rollbackWebhookEvent,
} from "../services/webhookDedup.service";
import {
  recordObservabilityEvent,
  recordTraceLedger,
} from "../services/reliability/reliabilityOS.service";
import {
  recordWebhookSpoofAttempt,
} from "../services/security/securityGovernanceOS.service";
import {
  extractMetaWebhookTimestamp,
  guardWebhookReplay,
  isWebhookTimestampFresh,
  verifyMetaWebhookSignature,
} from "../services/webhookSecurity.service";

const router = Router();
const WEBHOOK_DEBUG = process.env.LOG_WEBHOOK_DEBUG === "true";
const WEBHOOK_RUNTIME_BUDGET_MS = Math.max(
  250,
  Number(process.env.WEBHOOK_RUNTIME_BUDGET_MS || 1200)
);
const isProduction = process.env.NODE_ENV === "production";

const log = (...args: any[]) => {
  console.log("[INSTAGRAM WEBHOOK]", ...args);
};

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
    route: "instagram_webhook",
    metadata: {
      provider: "INSTAGRAM",
      ...(metadata || {}),
    },
  });
};

const normalizeIdentifier = (value?: unknown) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

const getUniqueIdentifiers = (values: unknown[]) =>
  Array.from(
    new Set(
      values
        .map((value) => normalizeIdentifier(value))
        .filter((value): value is string => Boolean(value))
    )
  );

const parseWebhookBody = (req: any) => {
  const rawBody = req.body;

  if (Buffer.isBuffer(rawBody)) {
    return JSON.parse(rawBody.toString("utf8"));
  }

  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  throw new Error("Invalid webhook body");
};

const getSignatureHeader = (req: Request) =>
  req.headers["x-hub-signature-256"] || req.headers["x-hub-signature"];

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
    await recordWebhookSpoofAttempt({
      businessId: null,
      tenantId: null,
      provider: "INSTAGRAM",
      signature: Array.isArray(signature) ? signature[0] : signature,
      reason: "signature_invalid",
      metadata: {
        requestId: req.requestId || null,
      },
    }).catch(() => undefined);
    return false;
  }

  const timestampMs = extractMetaWebhookTimestamp(body);

  if (!isWebhookTimestampFresh(timestampMs)) {
    await recordWebhookSpoofAttempt({
      businessId: null,
      tenantId: null,
      provider: "INSTAGRAM",
      signature: Array.isArray(signature) ? signature[0] : signature,
      reason: "timestamp_stale",
      metadata: {
        requestId: req.requestId || null,
        timestampMs,
      },
    }).catch(() => undefined);
    return false;
  }

  const replaySignature = Array.isArray(signature) ? signature[0] : signature;

  if (timestampMs && replaySignature) {
    const accepted = await guardWebhookReplay({
      platform: "INSTAGRAM",
      signature: String(replaySignature),
      timestampMs,
    });

    if (!accepted) {
      await recordWebhookSpoofAttempt({
        businessId: null,
        tenantId: null,
        provider: "INSTAGRAM",
        signature: replaySignature,
        reason: "replay_rejected",
        metadata: {
          requestId: req.requestId || null,
          timestampMs,
        },
      }).catch(() => undefined);
      return false;
    }
  }

  return true;
};

const parseInstagramCommentChange = ({
  entry,
  change,
}: {
  entry: any;
  change: any;
}) => {
  const value = change?.value || {};

  const commentId = normalizeIdentifier(
    value.id || value.comment_id || value.comment?.id
  );
  const commentText = normalizeIdentifier(value.text || value.comment?.text);
  const mediaId = normalizeIdentifier(value.media?.id || value.media_id);
  const senderId = normalizeIdentifier(value.from?.id);
  const pageIds = getUniqueIdentifiers([
    entry?.id,
    value.instagram_business_account?.id,
    value.instagram_business_account_id,
  ]);

  return {
    commentId,
    commentText,
    mediaId,
    senderId,
    pageIds,
  };
};

const getInstagramDeliveryMessageIds = (entry: any) => {
  const messagingIds = Array.isArray(entry?.messaging)
    ? entry.messaging.flatMap((item: any) =>
        Array.isArray(item?.delivery?.mids)
          ? item.delivery.mids
          : item?.delivery?.mid
            ? [item.delivery.mid]
            : []
      )
    : [];
  const changeStatusIds = Array.isArray(entry?.changes)
    ? entry.changes.flatMap((change: any) =>
        Array.isArray(change?.value?.statuses)
          ? change.value.statuses
              .map((status: any) =>
                normalizeIdentifier(status?.id || status?.message_id)
              )
              .filter((value: string | null): value is string => Boolean(value))
          : []
      )
    : [];

  return Array.from(
    new Set(
      [...messagingIds, ...changeStatusIds]
        .map((value) => normalizeIdentifier(value))
        .filter((value): value is string => Boolean(value))
    )
  );
};

router.get("/", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
    log("Webhook verified");
    return res.status(200).send(challenge);
  }

  log("Webhook verification failed");
  return res.sendStatus(403);
});

router.post("/", async (req: any, res: Response) => {
  const startedAt = Date.now();
  const webhookTraceId = `ig_webhook_${req.requestId || crypto.randomUUID()}`;
  let enqueuedJobs = 0;
  let dedupedEvents = 0;
  let body: any;

  const sendWebhookResponse = (statusCode: number, reason?: string) => {
    const ingestMs = Math.max(0, Date.now() - startedAt);
    emitWebhookMetric("webhook_ingest_ms", ingestMs, {
      statusCode,
      enqueuedJobs,
      dedupedEvents,
      traceId: webhookTraceId,
      reason: reason || null,
    });
    emitWebhookMetric("webhook_post_response_work", 0, {
      statusCode,
      traceId: webhookTraceId,
    });
    if (ingestMs > WEBHOOK_RUNTIME_BUDGET_MS) {
      emitWebhookMetric("webhook_runtime_budget_exceeded", ingestMs, {
        thresholdMs: WEBHOOK_RUNTIME_BUDGET_MS,
        statusCode,
        traceId: webhookTraceId,
      });
    }
    return res.sendStatus(statusCode);
  };

  try {
    body = parseWebhookBody(req);
  } catch (error) {
    req.logger?.error({ error }, "Instagram webhook body parse failed");
    captureExceptionWithContext(error, {
      tags: {
        webhook: "instagram",
        stage: "body_parse",
      },
    });
    await recordObservabilityEvent({
      eventType: "webhook.instagram.body_parse_failed",
      message: "Instagram webhook body parse failed",
      severity: "error",
      context: {
        traceId: webhookTraceId,
        correlationId: webhookTraceId,
        provider: "INSTAGRAM",
        component: "webhook",
        phase: "reception",
      },
      metadata: {
        error: String(
          (error as { message?: unknown })?.message ||
            error ||
            "body_parse_failed"
        ),
      },
    }).catch(() => undefined);
    return sendWebhookResponse(400, "body_parse_failed");
  }

  try {
    if (WEBHOOK_DEBUG) {
      log("Webhook received", {
        entryCount: Array.isArray(body?.entry) ? body.entry.length : 0,
      });
    }

    if (!(await enforceWebhookSecurity(req, body))) {
      await recordObservabilityEvent({
        eventType: "webhook.instagram.security_rejected",
        message: "Instagram webhook rejected by security guard",
        severity: "warn",
        context: {
          traceId: webhookTraceId,
          correlationId: webhookTraceId,
          provider: "INSTAGRAM",
          component: "webhook",
          phase: "reception",
        },
      }).catch(() => undefined);
      return sendWebhookResponse(403, "security_rejected");
    }

    const entry = body.entry?.[0];

    if (!entry) {
      return sendWebhookResponse(200, "entry_missing");
    }

    await recordTraceLedger({
      traceId: webhookTraceId,
      correlationId: webhookTraceId,
      stage: "webhook:instagram:accepted",
      status: "IN_PROGRESS",
      metadata: {
        entryCount: Array.isArray(body?.entry) ? body.entry.length : 0,
      },
    }).catch(() => undefined);

    const deliveryMessageIds = getInstagramDeliveryMessageIds(entry);
    if (deliveryMessageIds.length) {
      const enqueueStartedAt = Date.now();
      try {
        await enqueueProviderDeliveryReconcileJob({
          provider: "INSTAGRAM",
          traceId: webhookTraceId,
          requestId: req.requestId || null,
          providerMessageIds: deliveryMessageIds,
          deliveredAtIso: new Date().toISOString(),
        });
        emitWebhookMetric(
          "enqueue_ms",
          Math.max(0, Date.now() - enqueueStartedAt),
          {
            webhookTask: "delivery_reconcile",
            deliveryCount: deliveryMessageIds.length,
            traceId: webhookTraceId,
          }
        );
        enqueuedJobs += 1;
      } catch (error) {
        emitWebhookMetric("webhook_degraded", 1, {
          webhookTask: "delivery_reconcile",
          reason: "enqueue_failed",
          traceId: webhookTraceId,
        });
        emitWebhookMetric("webhook_queue_failure", 1, {
          webhookTask: "delivery_reconcile",
          traceId: webhookTraceId,
        });
        await recordObservabilityEvent({
          eventType: "webhook.instagram.delivery_reconcile_enqueue_failed",
          message: "Instagram delivery reconciliation enqueue failed",
          severity: "warn",
          context: {
            traceId: webhookTraceId,
            correlationId: webhookTraceId,
            provider: "INSTAGRAM",
            component: "webhook",
            phase: "enqueue",
          },
          metadata: {
            error: String(
              (error as { message?: unknown })?.message ||
                error ||
                "enqueue_failed"
            ),
            deliveryCount: deliveryMessageIds.length,
          },
        }).catch(() => undefined);
      }
    }

    for (const change of entry?.changes || []) {
      if (change.field !== "comments") {
        continue;
      }

      const {
        commentId,
        commentText,
        mediaId,
        senderId,
        pageIds,
      } = parseInstagramCommentChange({
        entry,
        change,
      });
      const commentEventId =
        commentId ||
        `${pageIds[0] || "unknown"}:${senderId || "unknown"}:${mediaId || "unknown"}:${String(commentText || "").trim()}`;

      if (!commentText || !senderId || !mediaId || !commentEventId) {
        continue;
      }

      const shouldProcessComment = await processWebhookEvent({
        eventId: String(commentEventId),
        platform: "INSTAGRAM",
      });

      if (!shouldProcessComment) {
        dedupedEvents += 1;
        emitWebhookMetric("webhook_deduped", 1, {
          webhookTask: "comment_intake",
          eventId: commentEventId,
          traceId: webhookTraceId,
        });
        if (process.env.WEBHOOK_DEDUP_ENABLED !== "false") {
          emitWebhookMetric("webhook_dedup_hit", 1, {
            webhookTask: "comment_intake",
            eventId: commentEventId,
            traceId: webhookTraceId,
          });
        }
        continue;
      } else {
        if (process.env.WEBHOOK_DEDUP_ENABLED !== "false") {
          emitWebhookMetric("webhook_dedup_miss", 1, {
            webhookTask: "comment_intake",
            eventId: commentEventId,
            traceId: webhookTraceId,
          });
        }
      }

      const enqueueStartedAt = Date.now();
      try {
        await enqueueInstagramCommentIngestJob({
          webhookTraceId,
          requestId: req.requestId || null,
          commentEventId: String(commentEventId),
          commentId,
          commentText,
          mediaId,
          senderId,
          pageIds,
        });
      } catch (error) {
        await rollbackWebhookEvent({
          eventId: String(commentEventId),
          platform: "INSTAGRAM",
        }).catch(() => undefined);

        emitWebhookMetric("webhook_degraded", 1, {
          webhookTask: "comment_intake",
          reason: "enqueue_failed",
          traceId: webhookTraceId,
        });
        emitWebhookMetric("webhook_queue_failure", 1, {
          webhookTask: "comment_intake",
          eventId: commentEventId,
          traceId: webhookTraceId,
        });

        await recordObservabilityEvent({
          eventType: "webhook.instagram.comment_enqueue_failed",
          message: "Instagram comment ingestion enqueue failed",
          severity: "error",
          context: {
            traceId: webhookTraceId,
            correlationId: webhookTraceId,
            provider: "INSTAGRAM",
            component: "webhook",
            phase: "enqueue",
          },
          metadata: {
            eventId: commentEventId,
            error: String(
              (error as { message?: unknown })?.message ||
                error ||
                "enqueue_failed"
            ),
          },
        }).catch(() => undefined);

        return sendWebhookResponse(503, "comment_enqueue_failed");
      }

      emitWebhookMetric(
        "enqueue_ms",
        Math.max(0, Date.now() - enqueueStartedAt),
        {
          webhookTask: "comment_intake",
          eventId: commentEventId,
          traceId: webhookTraceId,
        }
      );
      enqueuedJobs += 1;
    }

    let senderId: string | undefined;
    let text: string | undefined;
    let eventId: string | undefined;
    let pageIds: string[] = [];

    const messaging = entry?.messaging?.[0];
    if (messaging?.message?.text && !messaging?.message?.is_echo) {
      senderId = messaging.sender?.id;
      text = messaging.message.text;
      pageIds = getUniqueIdentifiers([messaging.recipient?.id, entry.id]);
      eventId = messaging.message.mid;
    }

    const changeMessage = entry?.changes?.[0]?.value?.messages?.[0];
    if (!text && changeMessage?.text?.body) {
      senderId = changeMessage.from;
      text = changeMessage.text.body;
      pageIds = getUniqueIdentifiers([entry.id]);
      eventId = changeMessage.id;
    }

    if (!senderId || !text || !pageIds.length) {
      return sendWebhookResponse(200, "message_identifiers_missing");
    }

    if (pageIds.includes(senderId)) {
      return sendWebhookResponse(200, "self_event");
    }

    const lowerText = text.toLowerCase();
    if (
      lowerText.includes("please wait") ||
      lowerText.includes("moment before sending")
    ) {
      return sendWebhookResponse(200, "provider_notice_filtered");
    }

    if (!eventId) {
      return sendWebhookResponse(200, "event_id_missing");
    }

    const shouldProcess = await processWebhookEvent({
      eventId,
      platform: "INSTAGRAM",
    });

    if (!shouldProcess) {
      dedupedEvents += 1;
      emitWebhookMetric("webhook_deduped", 1, {
        webhookTask: "message_intake",
        eventId,
        traceId: webhookTraceId,
      });
      if (process.env.WEBHOOK_DEDUP_ENABLED !== "false") {
        emitWebhookMetric("webhook_dedup_hit", 1, {
          webhookTask: "message_intake",
          eventId,
          traceId: webhookTraceId,
        });
      }
      return sendWebhookResponse(200, "duplicate_message");
    } else {
      if (process.env.WEBHOOK_DEDUP_ENABLED !== "false") {
        emitWebhookMetric("webhook_dedup_miss", 1, {
          webhookTask: "message_intake",
          eventId,
          traceId: webhookTraceId,
        });
      }
    }

    const enqueueStartedAt = Date.now();
    try {
      await enqueueInstagramMessageIngestJob({
        webhookTraceId,
        requestId: req.requestId || null,
        eventId,
        senderId,
        text,
        pageIds,
        diagnosticSenderId: normalizeIdentifier(senderId),
      });
    } catch (error) {
      await rollbackWebhookEvent({
        eventId,
        platform: "INSTAGRAM",
      }).catch(() => undefined);

      emitWebhookMetric("webhook_degraded", 1, {
        webhookTask: "message_intake",
        reason: "enqueue_failed",
        traceId: webhookTraceId,
      });
      emitWebhookMetric("webhook_queue_failure", 1, {
        webhookTask: "message_intake",
        eventId,
        traceId: webhookTraceId,
      });

      await recordObservabilityEvent({
        eventType: "webhook.instagram.message_enqueue_failed",
        message: "Instagram message ingestion enqueue failed",
        severity: "error",
        context: {
          traceId: webhookTraceId,
          correlationId: webhookTraceId,
          provider: "INSTAGRAM",
          component: "webhook",
          phase: "enqueue",
        },
        metadata: {
          eventId,
          error: String(
            (error as { message?: unknown })?.message ||
              error ||
              "enqueue_failed"
          ),
        },
      }).catch(() => undefined);

      return sendWebhookResponse(503, "message_enqueue_failed");
    }

    emitWebhookMetric("enqueue_ms", Math.max(0, Date.now() - enqueueStartedAt), {
      webhookTask: "message_intake",
      eventId,
      traceId: webhookTraceId,
    });
    enqueuedJobs += 1;

    return sendWebhookResponse(200, "accepted");
  } catch (error) {
    req.logger?.error({ error }, "Instagram webhook error");
    captureExceptionWithContext(error, {
      tags: {
        webhook: "instagram",
      },
    });
    await recordTraceLedger({
      traceId: webhookTraceId,
      correlationId: webhookTraceId,
      stage: "webhook:instagram:failed",
      status: "FAILED",
      endedAt: new Date(),
      metadata: {
        error: String(
          (error as { message?: unknown })?.message ||
            error ||
            "webhook_failed"
        ),
      },
    }).catch(() => undefined);
    await recordObservabilityEvent({
      eventType: "webhook.instagram.failed",
      message: "Instagram webhook processing failed",
      severity: "error",
      context: {
        traceId: webhookTraceId,
        correlationId: webhookTraceId,
        provider: "INSTAGRAM",
        component: "webhook",
        phase: "reception",
      },
      metadata: {
        error: String(
          (error as { message?: unknown })?.message ||
            error ||
            "webhook_failed"
        ),
      },
    }).catch(() => undefined);
    return sendWebhookResponse(500, "unhandled_error");
  }
});

export default router;
