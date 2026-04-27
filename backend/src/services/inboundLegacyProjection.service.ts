import prisma from "../config/prisma";
import { cancelFollowups, scheduleFollowups } from "../queues/followup.queue";
import { getIO } from "../sockets/socket.server";
import { recordConversionEvent } from "./salesAgent/conversionTracker.service";
import {
  coerceDate,
  coerceOptionalString,
  toRecord,
  type InboundInteractionAuthorityRecord,
} from "./reception.shared";

const findProjectedMessage = async (
  interaction: InboundInteractionAuthorityRecord
) => {
  const candidates = await prisma.message.findMany({
    where: {
      leadId: interaction.leadId,
      sender: "USER",
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 25,
  });

  return (
    candidates.find((candidate) => {
      const metadata = toRecord(candidate.metadata);
      return (
        metadata.interactionId === interaction.id ||
        metadata.externalInteractionKey === interaction.externalInteractionKey
      );
    }) || null
  );
};

const resolveProjectedMessageContent = (
  interaction: InboundInteractionAuthorityRecord
) => {
  const normalizedPayload = toRecord(interaction.normalizedPayload);
  return (
    coerceOptionalString(normalizedPayload.message) ||
    coerceOptionalString(toRecord(normalizedPayload.metadata).subject)
  );
};

export const projectInboundInteractionToLegacyInbox = async (
  interaction: InboundInteractionAuthorityRecord
) => {
  const content = resolveProjectedMessageContent(interaction);

  if (!content) {
    return null;
  }

  const existing = await findProjectedMessage(interaction);

  if (existing) {
    return {
      created: false,
      message: existing,
    };
  }

  const normalizedPayload = toRecord(interaction.normalizedPayload);
  const receivedAt = coerceDate(
    normalizedPayload.receivedAt,
    interaction.createdAt
  );
  const message = await prisma.message.create({
    data: {
      leadId: interaction.leadId,
      content,
      sender: "USER",
      metadata: {
        interactionId: interaction.id,
        externalInteractionKey: interaction.externalInteractionKey,
        providerMessageId: interaction.providerMessageId,
        platform: interaction.channel,
        traceId: interaction.traceId,
      },
      createdAt: receivedAt,
    },
  });

  await prisma.lead.update({
    where: {
      id: interaction.leadId,
    },
    data: {
      lastMessageAt: receivedAt,
      followupCount: 0,
      unreadCount: {
        increment: 1,
      },
    },
  });

  await recordConversionEvent({
    businessId: interaction.businessId,
    leadId: interaction.leadId,
    outcome: "replied",
    source: `${interaction.channel}_RUNTIME`,
    idempotencyKey: `reply:${interaction.externalInteractionKey}`,
    occurredAt: receivedAt,
    metadata: {
      interactionId: interaction.id,
      externalInteractionKey: interaction.externalInteractionKey,
      providerMessageId: interaction.providerMessageId,
      channel: interaction.channel,
    },
  }).catch(() => undefined);

  await cancelFollowups(interaction.leadId).catch(() => undefined);
  await scheduleFollowups(interaction.leadId).catch(() => undefined);

  try {
    getIO().to(`lead_${interaction.leadId}`).emit("new_message", message);
  } catch {
    // Socket emission is best effort for derived compatibility state.
  }

  return {
    created: true,
    message,
  };
};
