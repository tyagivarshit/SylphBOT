import prisma from "../config/prisma";
import {
  reconcileRevenueTouchDeliveryByProviderMessageId,
} from "./revenueTouchLedger.service";
import { resolveOrCreateReceptionLead } from "./receptionLead.service";
import { receiveInboundInteraction } from "./receptionIntake.service";
import { recordInboundProviderWebhook } from "./saasPackagingConnectHubOS.service";
import {
  recordObservabilityEvent,
  recordTraceLedger,
} from "./reliability/reliabilityOS.service";
import { enforceSecurityGovernanceInfluence } from "./security/securityGovernanceOS.service";
import type {
  InstagramCommentWebhookIngestPayload,
  InstagramMessageWebhookIngestPayload,
  ProviderDeliveryReconcileWebhookPayload,
  WhatsAppMessageWebhookIngestPayload,
} from "../queues/webhookIntake.queue";

const normalizeIdentifier = (value?: unknown) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

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

const findInstagramClient = async ({ pageIds }: { pageIds: string[] }) => {
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
  });

  if (!client) {
    console.error("CRITICAL: Instagram client mapping missing", {
      pageId: pageIds[0] || null,
      action: "Reconnect required",
    });
    return null;
  }

  return client;
};

const findWhatsAppClient = async ({
  phoneNumberIds,
  pageIds = [],
}: {
  phoneNumberIds: string[];
  pageIds?: string[];
}) => {
  const lookupOr = buildClientLookupOr({
    phoneNumberIds,
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
  });

  if (!client) {
    console.error("CRITICAL: WhatsApp client mapping missing", {
      pageId: pageIds[0] || null,
      phoneNumberId: phoneNumberIds[0] || null,
      action: "Reconnect required",
    });
    return null;
  }

  return client;
};

export const processInstagramMessageWebhookIngest = async (
  payload: InstagramMessageWebhookIngestPayload
) => {
  const client = await findInstagramClient({
    pageIds: payload.pageIds,
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
      webhookType: "message",
      eventId: payload.eventId,
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
    resourceId: payload.eventId,
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
      message: payload.text,
      mid: payload.eventId,
      from: {
        id: payload.senderId,
      },
      threadId: payload.pageIds[0],
      receivedAt: new Date().toISOString(),
    },
  });

  const fallbackSenderId = normalizeIdentifier(payload.senderId);
  const instagramUsername =
    lead.name ||
    (payload.diagnosticSenderId
      ? `ig:${payload.diagnosticSenderId.slice(0, 8)}`
      : fallbackSenderId
        ? `ig:${fallbackSenderId.slice(0, 8)}`
        : null);

  const intake = await receiveInboundInteraction({
    businessId: client.businessId,
    leadId: lead.id,
    clientId: client.id,
    adapter: "INSTAGRAM",
    payload: {
      message: payload.text,
      mid: payload.eventId,
      from: {
        id: payload.senderId,
        username: instagramUsername || undefined,
      },
      threadId: payload.pageIds[0],
      receivedAt: new Date().toISOString(),
    },
    interactionTypeHint: "DM",
    providerMessageIdHint: payload.eventId,
    correlationId: payload.requestId || payload.eventId,
    traceId: payload.requestId || payload.eventId,
    metadata: {
      webhook: "instagram_message",
      requestId: payload.requestId || null,
      pageId: payload.pageIds[0] || null,
    },
  });

  await recordTraceLedger({
    traceId: payload.webhookTraceId,
    correlationId: payload.webhookTraceId,
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
};

export const processInstagramCommentWebhookIngest = async (
  payload: InstagramCommentWebhookIngestPayload
) => {
  const client = await findInstagramClient({
    pageIds: payload.pageIds,
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
      commentId: payload.commentId || null,
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
    resourceId: payload.commentEventId,
    resourceTenantId: client.businessId,
    purpose: "INBOUND_MESSAGE",
    metadata: {
      provider: "INSTAGRAM",
      webhookType: "comment",
    },
  });

  const interactionPayload = {
    comment: {
      text: payload.commentText,
    },
    from: {
      id: payload.senderId,
    },
    mediaId: payload.mediaId,
    messageId: payload.commentId || payload.commentEventId,
    receivedAt: new Date().toISOString(),
  };

  const lead = await resolveOrCreateReceptionLead({
    businessId: client.businessId,
    clientId: client.id,
    adapter: "INSTAGRAM",
    payload: interactionPayload,
  });

  await receiveInboundInteraction({
    businessId: client.businessId,
    leadId: lead.id,
    clientId: client.id,
    adapter: "INSTAGRAM",
    payload: interactionPayload,
    interactionTypeHint: "COMMENT",
    providerMessageIdHint: payload.commentId || payload.commentEventId,
    correlationId: payload.requestId || payload.commentEventId,
    traceId: payload.requestId || payload.commentEventId,
    metadata: {
      webhook: "instagram_comment",
      requestId: payload.requestId || null,
      mediaId: payload.mediaId,
    },
  });
};

export const processWhatsAppMessageWebhookIngest = async (
  payload: WhatsAppMessageWebhookIngestPayload
) => {
  const client = await findWhatsAppClient({
    phoneNumberIds: payload.phoneNumberIds,
  });

  if (!client) {
    return;
  }

  await recordInboundProviderWebhook({
    businessId: client.businessId,
    tenantId: client.businessId,
    provider: "WHATSAPP",
    environment: "LIVE",
    success: true,
    details: {
      eventId: payload.eventId || null,
      phoneNumberId: payload.phoneNumberIds[0] || null,
      eventTimestampMs: payload.eventTimestampMs,
    },
  }).catch(() => undefined);

  const lead = await resolveOrCreateReceptionLead({
    businessId: client.businessId,
    clientId: client.id,
    adapter: "WHATSAPP",
    payload: payload.intakePayload,
  });

  await receiveInboundInteraction({
    businessId: client.businessId,
    leadId: lead.id,
    clientId: client.id,
    adapter: "WHATSAPP",
    payload: payload.intakePayload,
    providerMessageIdHint: payload.eventId || null,
    correlationId:
      payload.requestId || payload.eventId || payload.phoneNumberIds[0] || null,
    traceId: payload.requestId || payload.eventId || null,
    metadata: {
      webhook: "whatsapp",
      requestId: payload.requestId || null,
      phoneNumberId: payload.phoneNumberIds[0] || null,
    },
  });
};

export const processProviderDeliveryReconcileWebhook = async (
  payload: ProviderDeliveryReconcileWebhookPayload
) => {
  if (!payload.providerMessageIds.length) {
    return;
  }

  await Promise.allSettled(
    payload.providerMessageIds.map((providerMessageId) =>
      reconcileRevenueTouchDeliveryByProviderMessageId({
        providerMessageId,
        deliveredAt: payload.deliveredAtIso
          ? new Date(payload.deliveredAtIso)
          : new Date(),
      }).catch(() => undefined)
    )
  );

  await recordObservabilityEvent({
    eventType: `webhook.${payload.provider.toLowerCase()}.delivery_reconciled`,
    message: `${payload.provider} delivery reconciliation processed`,
    severity: "info",
    context: {
      traceId: payload.traceId || null,
      correlationId: payload.traceId || null,
      provider: payload.provider,
      component: "webhook-reconciliation",
      phase: "providers",
    },
    metadata: {
      deliveryCount: payload.providerMessageIds.length,
      requestId: payload.requestId || null,
    },
  }).catch(() => undefined);
};
