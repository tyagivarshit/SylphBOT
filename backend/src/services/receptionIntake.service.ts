import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import {
  INBOUND_INTERACTION_SELECT,
  buildExternalInteractionKey,
  buildInboundInteractionFingerprint,
  createInteractionNormalizerService,
  toInboundInteractionRecord,
  type NormalizerAdapterKey,
} from "./interactionNormalizer.service";
import {
  buildReceptionEventDedupeKey,
  publishReceptionEvent,
} from "./receptionEvent.service";
import {
  mergeJsonRecords,
  toRecord,
  type CanonicalInteractionType,
  type InboundInteractionAuthorityRecord,
  type JsonRecord,
} from "./reception.shared";
import {
  enqueueInboundClassification,
  enqueueInboundNormalization,
  enqueueInboundRouting,
} from "../queues/receptionRuntime.queue";
import { incrementReceptionMetric } from "./receptionMetrics.service";
import {
  recordObservabilityEvent,
  recordTraceLedger,
} from "./reliability/reliabilityOS.service";
import { enforceSecurityGovernanceInfluence } from "./security/securityGovernanceOS.service";

type ReceiveInboundInteractionCommand = {
  businessId: string;
  leadId: string;
  clientId?: string | null;
  adapter: NormalizerAdapterKey;
  payload: unknown;
  interactionTypeHint?: CanonicalInteractionType | null;
  providerMessageIdHint?: string | null;
  correlationId?: string | null;
  traceId?: string | null;
  metadata?: JsonRecord | null;
};

const normalizer = createInteractionNormalizerService();

const DEFAULT_INTERACTION_TYPES: Record<
  NormalizerAdapterKey,
  CanonicalInteractionType
> = {
  WHATSAPP: "MESSAGE",
  INSTAGRAM: "DM",
  EMAIL: "EMAIL",
  FORM: "FORM",
  VOICE: "CALL",
};

const buildFallbackExternalInteractionKey = ({
  businessId,
  adapter,
  interactionType,
  providerMessageId,
  payload,
}: {
  businessId: string;
  adapter: NormalizerAdapterKey;
  interactionType: CanonicalInteractionType;
  providerMessageId?: string | null;
  payload: unknown;
}) => {
  const normalizedProviderMessageId = String(providerMessageId || "").trim();

  if (normalizedProviderMessageId) {
    return [
      "inbound",
      businessId,
      adapter,
      interactionType,
      normalizedProviderMessageId,
    ].join(":");
  }

  return [
    "inbound",
    businessId,
    adapter,
    interactionType,
    Buffer.from(JSON.stringify(toRecord(payload))).toString("base64url"),
  ].join(":");
};

const resolveIntakePreview = (
  command: ReceiveInboundInteractionCommand
): {
  interactionType: CanonicalInteractionType;
  providerMessageId: string | null;
  externalInteractionKey: string;
} => {
  try {
    const normalized = normalizer.normalizePayload(command.adapter, command.payload);
    const fingerprint = buildInboundInteractionFingerprint(normalized.envelope);

    return {
      interactionType:
        command.interactionTypeHint || normalized.interactionType,
      providerMessageId:
        command.providerMessageIdHint || normalized.envelope.providerMessageId,
      externalInteractionKey: buildExternalInteractionKey({
        businessId: command.businessId,
        channel: normalized.envelope.channel,
        interactionType:
          command.interactionTypeHint || normalized.interactionType,
        envelope: normalized.envelope,
        fingerprint,
      }),
    };
  } catch {
    const interactionType =
      command.interactionTypeHint || DEFAULT_INTERACTION_TYPES[command.adapter];
    const providerMessageId = String(command.providerMessageIdHint || "").trim() || null;

    return {
      interactionType,
      providerMessageId,
      externalInteractionKey: buildFallbackExternalInteractionKey({
        businessId: command.businessId,
        adapter: command.adapter,
        interactionType,
        providerMessageId,
        payload: command.payload,
      }),
    };
  }
};

const resumeInboundRuntime = async (
  interaction: InboundInteractionAuthorityRecord
) => {
  if (interaction.lifecycleState === "ROUTED") {
    return enqueueInboundRouting({
      interactionId: interaction.id,
      traceId: interaction.traceId,
      externalInteractionKey: interaction.externalInteractionKey,
    });
  }

  if (interaction.lifecycleState === "CLASSIFIED") {
    return enqueueInboundRouting({
      interactionId: interaction.id,
      traceId: interaction.traceId,
      externalInteractionKey: interaction.externalInteractionKey,
    });
  }

  if (interaction.lifecycleState === "NORMALIZED") {
    return enqueueInboundClassification({
      interactionId: interaction.id,
      traceId: interaction.traceId,
      externalInteractionKey: interaction.externalInteractionKey,
    });
  }

  if (interaction.lifecycleState !== "RECEIVED") {
    return null;
  }

  return enqueueInboundNormalization({
    interactionId: interaction.id,
    traceId: interaction.traceId,
    externalInteractionKey: interaction.externalInteractionKey,
  });
};

export const receiveInboundInteraction = async (
  command: ReceiveInboundInteractionCommand
) => {
  await enforceSecurityGovernanceInfluence({
    domain: "RECEPTION",
    action: "messages:enqueue",
    businessId: command.businessId,
    tenantId: command.businessId,
    actorId: "reception_intake",
    actorType: "SERVICE",
    role: "SERVICE",
    permissions: ["messages:enqueue"],
    scopes: ["WRITE"],
    resourceType: "INBOUND_INTERACTION",
    resourceId: command.providerMessageIdHint || command.leadId,
    resourceTenantId: command.businessId,
    purpose: "INBOUND_PROCESSING",
    metadata: {
      adapter: command.adapter,
    },
  });

  const preview = resolveIntakePreview(command);
  const existing = await prisma.inboundInteraction.findUnique({
    where: {
      externalInteractionKey: preview.externalInteractionKey,
    },
    select: {
      id: true,
      metadata: true,
    },
  });
  const metadata = mergeJsonRecords(
    toRecord(existing?.metadata),
    command.metadata,
    {
      intakeAdapter: command.adapter,
      intakeRecordedAt: new Date().toISOString(),
    }
  );

  const row = await prisma.inboundInteraction.upsert({
    where: {
      externalInteractionKey: preview.externalInteractionKey,
    },
    update: {
      providerMessageId: preview.providerMessageId,
      payload: toRecord(command.payload) as Prisma.InputJsonValue,
      correlationId:
        command.correlationId || preview.externalInteractionKey,
      traceId: command.traceId || null,
      metadata: metadata as Prisma.InputJsonValue,
    },
    create: {
      businessId: command.businessId,
      leadId: command.leadId,
      clientId: command.clientId || null,
      channel: command.adapter,
      providerMessageId: preview.providerMessageId,
      externalInteractionKey: preview.externalInteractionKey,
      interactionType: preview.interactionType,
      direction: "INBOUND",
      payload: toRecord(command.payload) as Prisma.InputJsonValue,
      correlationId:
        command.correlationId || preview.externalInteractionKey,
      traceId: command.traceId || null,
      metadata: metadata as Prisma.InputJsonValue,
      lifecycleState: "RECEIVED",
    },
    select: INBOUND_INTERACTION_SELECT,
  });
  const interaction = toInboundInteractionRecord(row);

  await publishReceptionEvent({
    event: "inbound.received",
    businessId: interaction.businessId,
    aggregateType: "inbound_interaction",
    aggregateId: interaction.id,
    eventKey: interaction.externalInteractionKey,
    dedupeKey: buildReceptionEventDedupeKey({
      event: "inbound.received",
      aggregateId: interaction.id,
      eventKey: interaction.externalInteractionKey,
    }),
    payload: {
      interactionId: interaction.id,
      businessId: interaction.businessId,
      leadId: interaction.leadId,
      clientId: interaction.clientId,
      channel: interaction.channel,
      interactionType: interaction.interactionType,
      externalInteractionKey: interaction.externalInteractionKey,
      providerMessageId: interaction.providerMessageId,
      correlationId: interaction.correlationId,
      traceId: interaction.traceId,
      fingerprint: interaction.fingerprint || preview.externalInteractionKey,
      receivedAt: interaction.createdAt.toISOString(),
    },
  });

  if (!existing) {
    incrementReceptionMetric("inbound_received_total");
  }

  await recordTraceLedger({
    traceId: interaction.traceId,
    correlationId: interaction.correlationId || interaction.traceId,
    businessId: interaction.businessId,
    tenantId: interaction.businessId,
    leadId: interaction.leadId,
    interactionId: interaction.id,
    stage: "reception:inbound_received",
    status: "IN_PROGRESS",
    metadata: {
      channel: interaction.channel,
      interactionType: interaction.interactionType,
      externalInteractionKey: interaction.externalInteractionKey,
      deduped: Boolean(existing),
    },
  }).catch(() => undefined);

  await recordObservabilityEvent({
    businessId: interaction.businessId,
    tenantId: interaction.businessId,
    eventType: "reception.inbound.received",
    message: `Inbound interaction ${interaction.id} received`,
    severity: "info",
    context: {
      traceId: interaction.traceId,
      correlationId: interaction.correlationId || interaction.traceId,
      tenantId: interaction.businessId,
      leadId: interaction.leadId,
      interactionId: interaction.id,
      provider: interaction.channel,
      component: "reception",
      phase: "intake",
    },
    metadata: {
      externalInteractionKey: interaction.externalInteractionKey,
      interactionType: interaction.interactionType,
      deduped: Boolean(existing),
    },
  }).catch(() => undefined);

  await resumeInboundRuntime(interaction);

  return {
    interaction,
    created: !existing,
  };
};
