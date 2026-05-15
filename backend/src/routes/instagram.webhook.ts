import { Request, Response, Router } from "express";
import crypto from "crypto";
import prisma from "../config/prisma";
import { processWebhookEvent } from "../services/webhookDedup.service";
import { captureExceptionWithContext } from "../observability/sentry";
import { reconcileRevenueTouchDeliveryByProviderMessageId } from "../services/revenueTouchLedger.service";
import {
  extractMetaWebhookTimestamp,
  guardWebhookReplay,
  isWebhookTimestampFresh,
  verifyMetaWebhookSignature,
} from "../services/webhookSecurity.service";
import {
  enforceSecurityGovernanceInfluence,
  recordWebhookSpoofAttempt,
} from "../services/security/securityGovernanceOS.service";
import { resolveOrCreateReceptionLead } from "../services/receptionLead.service";
import { receiveInboundInteraction } from "../services/receptionIntake.service";
import {
  recordObservabilityEvent,
  recordTraceLedger,
} from "../services/reliability/reliabilityOS.service";
import { recordInboundProviderWebhook } from "../services/saasPackagingConnectHubOS.service";

const router = Router();
const WEBHOOK_DEBUG = process.env.LOG_WEBHOOK_DEBUG === "true";
const isProduction = process.env.NODE_ENV === "production";

const log = (...args: any[]) => {
  console.log("[INSTAGRAM WEBHOOK]", ...args);
};

const runWebhookBackgroundTask = (
  label: string,
  task: () => Promise<void>
) => {
  setImmediate(() => {
    void task().catch((error) => {
      console.error("[INSTAGRAM WEBHOOK] background task failed", {
        label,
        reason: String((error as Error)?.message || "background_task_failed"),
      });
    });
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

const buildClientLookupOr = ({
  pageIds = [],
  phoneNumberIds = [],
}: {
  pageIds?: string[];
  phoneNumberIds?: string[];
}) => [
  ...pageIds.map((pageId) => ({ pageId })),
  ...phoneNumberIds.map((phoneNumberId) => ({ phoneNumberId })),
];

const clientBusinessInclude = {
  business: {
    select: {
      ownerId: true,
    },
  },
};

const findInstagramClient = async ({
  pageIds,
  includeBusiness = false,
}: {
  pageIds: string[];
  includeBusiness?: boolean;
}): Promise<any> => {
  const lookupOr = buildClientLookupOr({
    pageIds,
  });

  if (!lookupOr.length) {
    return null;
  }

  const client = await prisma.client.findFirst({
    where: {
      OR: lookupOr,
      isActive: true,
    },
    ...(includeBusiness
      ? {
          include: clientBusinessInclude,
        }
      : {}),
  });

  if (!client) {
    console.error("❌ CRITICAL: Client mapping missing", {
      pageId: pageIds[0] || null,
      phoneNumberId: null,
      action: "Reconnect required",
    });
    return null;
  }

  log("client found", {
    pageIds,
    clientId: client.id,
    businessId: client.businessId,
  });

  return client;
};

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

  if ((isProduction || secret) && (!rawBody || !verifyMetaWebhookSignature({
    rawBody,
    signature,
    secret,
  }))) {
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
  const commentText = normalizeIdentifier(
    value.text || value.comment?.text
  );
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
              .map((status: any) => normalizeIdentifier(status?.id || status?.message_id))
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
  let body: any;
  const webhookTraceId = `ig_webhook_${req.requestId || crypto.randomUUID()}`;
  let checkpointReached = "[STEP 1] entered route";
  let diagnosticSenderId: string | null = null;
  let diagnosticRecipientId: string | null = null;
  let diagnosticMessageMid: string | null = null;

  console.log("🔥 WEBHOOK HIT", JSON.stringify(req.body));

  log("[STEP 1] entered route");

  try {
    body = parseWebhookBody(req);
  } catch (error) {
    const rawMessaging =
      !Buffer.isBuffer(req.body) && req.body && typeof req.body === "object"
        ? req.body?.entry?.[0]?.messaging?.[0]
        : undefined;
    diagnosticSenderId =
      diagnosticSenderId || normalizeIdentifier(rawMessaging?.sender?.id);
    diagnosticRecipientId =
      diagnosticRecipientId || normalizeIdentifier(rawMessaging?.recipient?.id);
    diagnosticMessageMid =
      diagnosticMessageMid || normalizeIdentifier(rawMessaging?.message?.mid);

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
        error: String((error as { message?: unknown })?.message || error || "body_parse_failed"),
      },
    }).catch(() => undefined);
    log("Body parse failed", {
      message: (error as { message?: string })?.message || "Unknown error",
    });
    log("Webhook error diagnostics", {
      "error.message": (error as { message?: string })?.message || "Unknown error",
      "error.stack": (error as { stack?: string })?.stack || null,
      "checkpoint reached": checkpointReached,
      "sender.id": diagnosticSenderId,
      "recipient.id": diagnosticRecipientId,
      "message.mid": diagnosticMessageMid,
    });
    return res.sendStatus(400);
  }

  try {
    if (WEBHOOK_DEBUG) {
      log("Webhook received", {
        entryCount: Array.isArray(body?.entry) ? body.entry.length : 0,
      });
    }

    if (!(await enforceWebhookSecurity(req, body))) {
      log("Webhook security validation failed");
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
      return res.sendStatus(403);
    }
    checkpointReached = "[STEP 2] signature validated";
    log("[STEP 2] signature validated");
    checkpointReached = "[STEP 3] replay guard passed";
    log("[STEP 3] replay guard passed");

    const entry = body.entry?.[0];

    if (!entry) {
      return res.sendStatus(200);
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
      runWebhookBackgroundTask("delivery_reconcile", async () => {
        await Promise.allSettled(
          deliveryMessageIds.map((providerMessageId) =>
            reconcileRevenueTouchDeliveryByProviderMessageId({
              providerMessageId,
              deliveredAt: new Date(),
            }).catch(() => undefined)
          )
        );

        await recordObservabilityEvent({
          eventType: "webhook.instagram.delivery_reconciled",
          message: "Instagram delivery reconciliation processed",
          severity: "info",
          context: {
            traceId: webhookTraceId,
            correlationId: webhookTraceId,
            provider: "INSTAGRAM",
            component: "webhook-reconciliation",
            phase: "providers",
          },
          metadata: {
            deliveryCount: deliveryMessageIds.length,
          },
        }).catch(() => undefined);
      });
    }

    for (const change of entry?.changes || []) {
      if (change.field !== "comments") {
        continue;
      }

      try {
        const rawCommentValue = change?.value || {};
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

        console.log("📩 COMMENT EVENT DETECTED", {
          commentId: rawCommentValue.id,
          text: rawCommentValue.text,
          mediaId: rawCommentValue.media?.id,
          from: rawCommentValue.from?.id,
        });

        console.log("🔥 COMMENT EVENT RECEIVED", {
          commentId,
          text: commentText,
          mediaId,
          senderId,
        });

        const commentEventId =
          commentId ||
          `${pageIds[0] || "unknown"}:${senderId || "unknown"}:${mediaId || "unknown"}:${String(commentText || "").trim()}`;

        if (!commentText || !senderId || !mediaId || !commentEventId) {
          log("Comment event skipped due to missing identifiers", {
            commentId,
            mediaId,
            senderId,
            pageIds,
          });
          continue;
        }

        const shouldProcessComment = await processWebhookEvent({
          eventId: String(commentEventId),
          platform: "INSTAGRAM",
        });

        if (!shouldProcessComment) {
          log("Duplicate Instagram comment event skipped", {
            commentId,
          });
          continue;
        }

        log("comment identifiers", {
          pageIds,
          commentId,
          mediaId,
          senderId,
        });
        runWebhookBackgroundTask("comment_intake", async () => {
          const client = await findInstagramClient({
            pageIds,
          });

          if (!client) {
            return;
          }

          await recordInboundProviderWebhook({
            businessId: client.businessId,
            tenantId: client.businessId,
            provider: "INSTAGRAM",
            environment: "LIVE",
            success: true,
            details: {
              webhookType: "comment",
              commentId: commentId || null,
            },
          }).catch(() => undefined);

          await enforceSecurityGovernanceInfluence({
            domain: "RECEPTION",
            action: "messages:enqueue",
            businessId: client.businessId,
            tenantId: client.businessId,
            actorId: "instagram_webhook",
            actorType: "WEBHOOK",
            role: "SERVICE",
            permissions: ["messages:enqueue"],
            scopes: ["WRITE"],
            resourceType: "INSTAGRAM_COMMENT",
            resourceId: commentEventId,
            resourceTenantId: client.businessId,
            purpose: "INBOUND_MESSAGE",
            metadata: {
              provider: "INSTAGRAM",
              webhookType: "comment",
            },
          });

          const payload = {
            comment: {
              text: commentText,
            },
            from: {
              id: senderId,
            },
            mediaId,
            messageId: commentId || commentEventId,
            receivedAt: new Date().toISOString(),
          };

          const lead = await resolveOrCreateReceptionLead({
            businessId: client.businessId,
            clientId: client.id,
            adapter: "INSTAGRAM",
            payload,
          });

          await receiveInboundInteraction({
            businessId: client.businessId,
            leadId: lead.id,
            clientId: client.id,
            adapter: "INSTAGRAM",
            payload,
            interactionTypeHint: "COMMENT",
            providerMessageIdHint: commentId || commentEventId,
            correlationId: req.requestId || commentEventId,
            traceId: req.requestId || commentEventId,
            metadata: {
              webhook: "instagram_comment",
              requestId: req.requestId,
              mediaId,
            },
          });
        });

      } catch (commentError) {
        req.logger?.error(
          { error: commentError },
          "Instagram comment webhook processing failed"
        );
        captureExceptionWithContext(commentError, {
          tags: {
            webhook: "instagram",
            stage: "comment_processing",
          },
        });
        console.error("❌ Instagram comment webhook processing failed", commentError);
        continue;
      }
    }

    let senderId: string | undefined;
    let text: string | undefined;
    let eventId: string | undefined;
    let pageIds: string[] = [];

    const messaging = entry?.messaging?.[0];
    diagnosticSenderId =
      diagnosticSenderId || normalizeIdentifier(messaging?.sender?.id);
    diagnosticRecipientId =
      diagnosticRecipientId || normalizeIdentifier(messaging?.recipient?.id);
    diagnosticMessageMid =
      diagnosticMessageMid || normalizeIdentifier(messaging?.message?.mid);

    if (messaging?.message?.text && !messaging?.message?.is_echo) {
      senderId = messaging.sender?.id;
      text = messaging.message.text;
      pageIds = getUniqueIdentifiers([messaging.recipient?.id, entry.id]);
      eventId = messaging.message.mid;
      diagnosticSenderId = normalizeIdentifier(senderId);
      diagnosticRecipientId =
        normalizeIdentifier(messaging.recipient?.id) || diagnosticRecipientId;
      diagnosticMessageMid = normalizeIdentifier(eventId) || diagnosticMessageMid;
    }

    const changeMessage = entry?.changes?.[0]?.value?.messages?.[0];

    if (!text && changeMessage?.text?.body) {
      senderId = changeMessage.from;
      text = changeMessage.text.body;
      pageIds = getUniqueIdentifiers([entry.id]);
      eventId = changeMessage.id;
      diagnosticSenderId = normalizeIdentifier(senderId) || diagnosticSenderId;
      diagnosticRecipientId = normalizeIdentifier(entry.id) || diagnosticRecipientId;
      diagnosticMessageMid = normalizeIdentifier(eventId) || diagnosticMessageMid;
    }

    if (!senderId || !text || !pageIds.length) {
      return res.sendStatus(200);
    }

    if (pageIds.includes(senderId)) {
      return res.sendStatus(200);
    }

    const lowerText = text.toLowerCase();

    if (
      lowerText.includes("please wait") ||
      lowerText.includes("moment before sending")
    ) {
      return res.sendStatus(200);
    }

    if (!eventId) {
      return res.sendStatus(200);
    }

    const shouldProcess = await processWebhookEvent({
      eventId,
      platform: "INSTAGRAM",
    });

    if (!shouldProcess) {
      return res.sendStatus(200);
    }
    checkpointReached = "[STEP 4] dedupe passed";
    log("[STEP 4] dedupe passed");

    log("message identifiers", {
      pageIds,
    });
    runWebhookBackgroundTask("message_intake", async () => {
      const client = await findInstagramClient({
        pageIds,
        includeBusiness: true,
      });

      if (!client) {
        return;
      }

      checkpointReached = "[STEP 5] client mapping resolved";
      log("[STEP 5] client mapping resolved");

      await recordInboundProviderWebhook({
        businessId: client.businessId,
        tenantId: client.businessId,
        provider: "INSTAGRAM",
        environment: "LIVE",
        success: true,
        details: {
          webhookType: "message",
          eventId: eventId || null,
        },
      }).catch(() => undefined);

      await enforceSecurityGovernanceInfluence({
        domain: "RECEPTION",
        action: "messages:enqueue",
        businessId: client.businessId,
        tenantId: client.businessId,
        actorId: "instagram_webhook",
        actorType: "WEBHOOK",
        role: "SERVICE",
        permissions: ["messages:enqueue"],
        scopes: ["WRITE"],
        resourceType: "INSTAGRAM_MESSAGE",
        resourceId: eventId,
        resourceTenantId: client.businessId,
        purpose: "INBOUND_MESSAGE",
        metadata: {
          provider: "INSTAGRAM",
          webhookType: "message",
        },
      });

      const lead = await resolveOrCreateReceptionLead({
        businessId: client.businessId,
        clientId: client.id,
        adapter: "INSTAGRAM",
        payload: {
          message: text,
          mid: eventId,
          from: {
            id: senderId,
          },
          threadId: pageIds[0],
          receivedAt: new Date().toISOString(),
        },
      });
      checkpointReached = "[STEP 6] lead resolved";
      log("[STEP 6] lead resolved");

      const instagramUsername =
        lead.name ||
        (diagnosticSenderId ? `ig:${diagnosticSenderId.slice(0, 8)}` : null);
      checkpointReached = "[STEP 7] username enrichment complete";
      log("[STEP 7] username enrichment complete");
      checkpointReached = "[STEP 8] before receiveInboundInteraction";
      log("[STEP 8] before receiveInboundInteraction");

      const intake = await receiveInboundInteraction({
        businessId: client.businessId,
        leadId: lead.id,
        clientId: client.id,
        adapter: "INSTAGRAM",
        payload: {
          message: text,
          mid: eventId,
          from: {
            id: senderId,
            username: instagramUsername || undefined,
          },
          threadId: pageIds[0],
          receivedAt: new Date().toISOString(),
        },
        interactionTypeHint: "DM",
        providerMessageIdHint: eventId,
        correlationId: req.requestId || eventId,
        traceId: req.requestId || eventId,
        metadata: {
          webhook: "instagram_message",
          requestId: req.requestId,
          pageId: pageIds[0],
        },
      });
      checkpointReached = "[STEP 9] intake complete";
      log("[STEP 9] intake complete");

      if (WEBHOOK_DEBUG) {
        log("Canonical interaction accepted", {
          businessId: client.businessId,
          leadId: lead.id,
          interactionId: intake.interaction.id,
          externalInteractionKey: intake.interaction.externalInteractionKey,
        });
      }

      await recordTraceLedger({
        traceId: webhookTraceId,
        correlationId: webhookTraceId,
        businessId: client.businessId,
        tenantId: client.businessId,
        leadId: lead.id,
        interactionId: intake.interaction.id,
        stage: "webhook:instagram:completed",
        status: "COMPLETED",
        endedAt: new Date(),
        metadata: {
          externalInteractionKey: intake.interaction.externalInteractionKey,
        },
      }).catch(() => undefined);
    });

    checkpointReached = "[STEP 10] returning fast ack";
    log("[STEP 10] returning fast ack");
    return res.sendStatus(200);
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
        error: String((error as { message?: unknown })?.message || error || "webhook_failed"),
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
        error: String((error as { message?: unknown })?.message || error || "webhook_failed"),
      },
    }).catch(() => undefined);
    log("Webhook error diagnostics", {
      "error.message": (error as { message?: string })?.message || "Unknown error",
      "error.stack": (error as { stack?: string })?.stack || null,
      "checkpoint reached": checkpointReached,
      "sender.id": diagnosticSenderId,
      "recipient.id": diagnosticRecipientId,
      "message.mid": diagnosticMessageMid,
    });
    log("Webhook error:", error);
    return res.sendStatus(500);
  }
});

export default router;
