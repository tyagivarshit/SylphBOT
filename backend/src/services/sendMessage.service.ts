import axios from "axios";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { cancelFollowups } from "../queues/followup.queue";
import { getIO } from "../sockets/socket.server";
import { isConsentRevoked } from "./consentAuthority.service";
import { bumpLeadCancelToken } from "./leadControlState.service";
import {
  buildRevenueTouchOutboundKey,
  findRevenueTouchLedgerByOutboundKey,
  isRevenueTouchStateAtLeast,
  upsertRevenueTouchLedger,
} from "./revenueTouchLedger.service";
import { decrypt } from "../utils/encrypt";
import logger from "../utils/logger";
import { createTakeoverLedgerService } from "./takeoverLedger.service";

export type SupportedMessageSender = "USER" | "AI" | "AGENT";
export type SupportedOutboundPlatform = "INSTAGRAM" | "WHATSAPP";

type MessageMetadata = Record<string, unknown>;

type HumanTakeoverDispatchContext = {
  interactionId?: string | null;
  humanId?: string | null;
  resolved?: boolean;
  resolutionCode?: string | null;
  releaseOutcome?: string | null;
};

type LeadMessageTarget = {
  id: string;
  businessId?: string | null;
  clientId?: string | null;
  platform?: string | null;
  phone?: string | null;
  instagramId?: string | null;
  client?: {
    accessToken?: string | null;
    phoneNumberId?: string | null;
    platform?: string | null;
  } | null;
};

export type OutboundDeliveryResult = {
  delivered: boolean;
  platform: SupportedOutboundPlatform | null;
  providerMessageId?: string | null;
  acceptedAt?: string | null;
  reason?: string;
  error?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizePlatform = (
  platform?: string | null
): SupportedOutboundPlatform | null => {
  const normalizedPlatform = String(platform || "")
    .trim()
    .toUpperCase();

  if (normalizedPlatform === "INSTAGRAM" || normalizedPlatform === "WHATSAPP") {
    return normalizedPlatform;
  }

  return null;
};

const isObjectIdLike = (value: unknown) =>
  /^[a-fA-F0-9]{24}$/.test(String(value || "").trim());

const getMessageMetadata = (metadata: unknown): MessageMetadata =>
  isRecord(metadata) ? metadata : {};

const getDeliveryErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data;

    if (isRecord(responseData)) {
      const nestedError = responseData.error;

      if (isRecord(nestedError)) {
        const errorMessage =
          nestedError.error_user_msg ||
          nestedError.message ||
          responseData.message;

        if (typeof errorMessage === "string" && errorMessage.trim()) {
          return errorMessage;
        }
      }

      if (
        typeof responseData.message === "string" &&
        responseData.message.trim()
      ) {
        return responseData.message;
      }
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown delivery error";
};

const extractProviderMessageId = (value: unknown) => {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.message_id === "string" && value.message_id.trim()) {
    return value.message_id.trim();
  }

  if (Array.isArray(value.messages)) {
    const first = value.messages.find(
      (message) => isRecord(message) && typeof message.id === "string"
    ) as { id?: string } | undefined;

    if (typeof first?.id === "string" && first.id.trim()) {
      return first.id.trim();
    }
  }

  return null;
};

export const formatConversationMessage = <T extends { metadata?: unknown }>(
  message: T
) => {
  const metadata = getMessageMetadata(message.metadata);
  const cta = typeof metadata.cta === "string" ? metadata.cta : null;

  return {
    ...message,
    metadata,
    cta,
  };
};

export const sendInstagramMessage = async ({
  recipientId,
  message,
  accessToken,
}: {
  recipientId: string;
  message: string;
  accessToken: string;
}) => {
  const response = await axios.post(
    "https://graph.facebook.com/v19.0/me/messages",
    {
      recipient: { id: recipientId },
      message: { text: message },
    },
    {
      timeout: 10000,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  return {
    providerMessageId: extractProviderMessageId(response.data),
  };
};

export const sendWhatsAppMessage = async ({
  phoneNumberId,
  to,
  message,
  accessToken,
}: {
  phoneNumberId: string;
  to: string;
  message: string;
  accessToken: string;
}) => {
  const response = await axios.post(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message },
    },
    {
      timeout: 10000,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  return {
    providerMessageId: extractProviderMessageId(response.data),
  };
};

export const deliverLeadMessage = async ({
  lead,
  message,
}: {
  lead: LeadMessageTarget;
  message: string;
}): Promise<OutboundDeliveryResult> => {
  const platform = normalizePlatform(lead.platform || lead.client?.platform);

  if (!platform) {
    return {
      delivered: false,
      platform: null,
      reason: "UNSUPPORTED_PLATFORM",
      error: "Lead platform is not supported for outbound delivery",
    };
  }

  if (!lead.client?.accessToken) {
    return {
      delivered: false,
      platform,
      reason: "MISSING_ACCESS_TOKEN",
      error: "Connected channel access token is missing",
    };
  }

  const accessToken = decrypt(lead.client.accessToken);

  if (!accessToken) {
    return {
      delivered: false,
      platform,
      reason: "INVALID_ACCESS_TOKEN",
      error: "Unable to decrypt channel access token",
    };
  }

  if (
    lead.businessId &&
    (await isConsentRevoked({
      businessId: lead.businessId,
      leadId: lead.id,
      channel: platform,
      scope: "CONVERSATIONAL_OUTBOUND",
    }))
  ) {
    return {
      delivered: false,
      platform,
      reason: "CONSENT_REVOKED",
      error: "Outbound consent is revoked for this channel",
    };
  }

  try {
    if (platform === "INSTAGRAM") {
      if (!lead.instagramId) {
        return {
          delivered: false,
          platform,
          reason: "MISSING_INSTAGRAM_ID",
          error: "Lead Instagram recipient id is missing",
        };
      }

      const result = await sendInstagramMessage({
        recipientId: lead.instagramId,
        message,
        accessToken,
      });

      if (!result.providerMessageId) {
        throw new Error("provider_message_id_missing");
      }

      return {
        delivered: true,
        platform,
        providerMessageId: result.providerMessageId,
        acceptedAt: new Date().toISOString(),
      };
    }

    if (!lead.client.phoneNumberId || !lead.phone) {
      return {
        delivered: false,
        platform,
        reason: "MISSING_WHATSAPP_TARGET",
        error: "Lead WhatsApp delivery details are missing",
      };
    }

    const result = await sendWhatsAppMessage({
      phoneNumberId: lead.client.phoneNumberId,
      to: lead.phone,
      message,
      accessToken,
    });

    if (!result.providerMessageId) {
      throw new Error("provider_message_id_missing");
    }

    return {
      delivered: true,
      platform,
      providerMessageId: result.providerMessageId,
      acceptedAt: new Date().toISOString(),
    };
  } catch (error) {
    const errorMessage = getDeliveryErrorMessage(error);

    logger.error(
      {
        leadId: lead.id,
        platform,
        error,
      },
      "Outbound message delivery failed"
    );

    return {
      delivered: false,
      platform,
      reason: "DELIVERY_FAILED",
      error: errorMessage,
    };
  }
};

const buildMessageMetadata = ({
  existingMetadata,
  clientMessageId,
  platform,
  delivery,
  outboundKey,
}: {
  existingMetadata?: unknown;
  clientMessageId?: string | null;
  platform?: string | null;
  delivery?: OutboundDeliveryResult | null;
  outboundKey?: string | null;
}) => {
  const metadata = {
    ...getMessageMetadata(existingMetadata),
  } as MessageMetadata;

  if (clientMessageId) {
    metadata.clientMessageId = clientMessageId;
  }

  if (platform) {
    metadata.platform = platform;
  }

  if (outboundKey) {
    metadata.outboundKey = outboundKey;
  }

  if (delivery) {
    metadata.delivery = {
      status: delivery.delivered ? "CONFIRMED" : "FAILED",
      platform: delivery.platform,
      providerMessageId: delivery.providerMessageId || null,
      reason: delivery.reason || null,
      error: delivery.error || null,
      attemptedAt: delivery.acceptedAt || new Date().toISOString(),
    };
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

const resolveHumanTakeoverTarget = async ({
  lead,
  requestedInteractionId,
}: {
  lead: LeadMessageTarget;
  requestedInteractionId?: string | null;
}) => {
  if (!lead.businessId) {
    return null;
  }

  if (!isObjectIdLike(lead.businessId) || !isObjectIdLike(lead.id)) {
    return null;
  }

  const normalizedInteractionId = String(requestedInteractionId || "").trim();

  if (normalizedInteractionId && isObjectIdLike(normalizedInteractionId)) {
    const requestedQueue = await prisma.humanWorkQueue.findUnique({
      where: {
        interactionId: normalizedInteractionId,
      },
      select: {
        interactionId: true,
        assignedHumanId: true,
        businessId: true,
        leadId: true,
      },
    });

    if (
      requestedQueue &&
      requestedQueue.businessId === lead.businessId &&
      requestedQueue.leadId === lead.id
    ) {
      return requestedQueue;
    }
  }

  return prisma.humanWorkQueue.findFirst({
    where: {
      businessId: lead.businessId,
      leadId: lead.id,
      state: {
        in: ["PENDING", "ASSIGNED", "IN_PROGRESS", "ESCALATED", "RESOLVED", "CLOSED"],
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      interactionId: true,
      assignedHumanId: true,
      businessId: true,
      leadId: true,
    },
  });
};

export const persistAndDispatchLeadMessage = async ({
  lead,
  content,
  sender,
  clientMessageId,
  humanTakeover,
}: {
  lead: LeadMessageTarget;
  content: string;
  sender: SupportedMessageSender;
  clientMessageId?: string | null;
  humanTakeover?: HumanTakeoverDispatchContext | null;
}) => {
  const platform = normalizePlatform(lead.platform || lead.client?.platform);
  const initialMetadata = buildMessageMetadata({
    clientMessageId,
    platform,
  });

  const createdMessage = await prisma.message.create({
    data: {
      content,
      sender,
      lead: {
        connect: {
          id: lead.id,
        },
      },
      ...(initialMetadata
        ? { metadata: initialMetadata as Prisma.InputJsonValue }
        : {}),
    },
  });

  let delivery: OutboundDeliveryResult | null = null;
  let persistedMessage = createdMessage;
  const outboundKey =
    sender === "USER"
      ? null
      : buildRevenueTouchOutboundKey({
          source: sender === "AGENT" ? "MANUAL" : sender,
          leadId: lead.id,
          clientMessageId,
          messageId: createdMessage.id,
        });

  if (sender === "AGENT") {
    await bumpLeadCancelToken({
      leadId: lead.id,
      businessId: lead.businessId || null,
      lastManualOutboundAt: new Date(),
      metadata: {
        reason: "manual_send",
        outboundKey,
      },
    });

    if (outboundKey) {
      await upsertRevenueTouchLedger({
        businessId: lead.businessId || "",
        leadId: lead.id,
        clientId: lead.clientId || null,
        messageId: createdMessage.id,
        touchType: "MANUAL_OUTBOUND",
        touchReason: "manual_send",
        channel: platform || "UNKNOWN",
        actor: sender,
        source: "MANUAL",
        traceId: clientMessageId || null,
        providerMessageId: null,
        outboundKey,
        deliveryState: "RESERVED",
        cta:
          typeof getMessageMetadata(createdMessage.metadata).cta === "string"
            ? String(getMessageMetadata(createdMessage.metadata).cta)
            : null,
        angle: null,
        leadState: null,
        messageType: "MANUAL_OUTBOUND",
        metadata: getMessageMetadata(createdMessage.metadata),
      });
    }

    const existingTouch = outboundKey
      ? await findRevenueTouchLedgerByOutboundKey(outboundKey)
      : null;

    if (
      existingTouch &&
      isRevenueTouchStateAtLeast(
        existingTouch.deliveryState,
        "PROVIDER_MESSAGE_ID_PERSISTED"
      )
    ) {
      delivery = {
        delivered: true,
        platform,
        providerMessageId: existingTouch.providerMessageId || null,
        acceptedAt:
          existingTouch.providerAcceptedAt?.toISOString() ||
          new Date().toISOString(),
      };
    } else {
      delivery = await deliverLeadMessage({
        lead,
        message: content,
      });
    }

    if (delivery.delivered && !delivery.providerMessageId) {
      throw new Error("provider_message_id_missing");
    }

    if (outboundKey && delivery.delivered) {
      const providerAcceptedAt = delivery.acceptedAt
        ? new Date(delivery.acceptedAt)
        : new Date();
      const providerMessagePersistedAt = new Date();

      await upsertRevenueTouchLedger({
        businessId: lead.businessId || "",
        leadId: lead.id,
        clientId: lead.clientId || null,
        messageId: createdMessage.id,
        touchType: "MANUAL_OUTBOUND",
        touchReason: "manual_send",
        channel: platform || "UNKNOWN",
        actor: sender,
        source: "MANUAL",
        traceId: clientMessageId || null,
        providerMessageId: delivery.providerMessageId || null,
        outboundKey,
        deliveryState: "PROVIDER_ACCEPTED",
        providerAcceptedAt,
        cta:
          typeof getMessageMetadata(createdMessage.metadata).cta === "string"
            ? String(getMessageMetadata(createdMessage.metadata).cta)
            : null,
        angle: null,
        leadState: null,
        messageType: "MANUAL_OUTBOUND",
        metadata: {
          ...getMessageMetadata(createdMessage.metadata),
          providerMessageId: delivery.providerMessageId || null,
        },
      });
      await upsertRevenueTouchLedger({
        businessId: lead.businessId || "",
        leadId: lead.id,
        clientId: lead.clientId || null,
        messageId: createdMessage.id,
        touchType: "MANUAL_OUTBOUND",
        touchReason: "manual_send",
        channel: platform || "UNKNOWN",
        actor: sender,
        source: "MANUAL",
        traceId: clientMessageId || null,
        providerMessageId: delivery.providerMessageId || null,
        outboundKey,
        deliveryState: "PROVIDER_MESSAGE_ID_PERSISTED",
        providerAcceptedAt,
        providerMessagePersistedAt,
        cta:
          typeof getMessageMetadata(createdMessage.metadata).cta === "string"
            ? String(getMessageMetadata(createdMessage.metadata).cta)
            : null,
        angle: null,
        leadState: null,
        messageType: "MANUAL_OUTBOUND",
        metadata: {
          ...getMessageMetadata(createdMessage.metadata),
          providerMessageId: delivery.providerMessageId || null,
        },
      });
    }

    const updatedMetadata = buildMessageMetadata({
      existingMetadata: createdMessage.metadata,
      clientMessageId,
      platform,
      delivery,
      outboundKey,
    });

    persistedMessage = await prisma.message.update({
      where: { id: createdMessage.id },
      data: {
        metadata: updatedMetadata as Prisma.InputJsonValue,
      },
    });

    if (outboundKey) {
      await upsertRevenueTouchLedger({
        businessId: lead.businessId || "",
        leadId: lead.id,
        clientId: lead.clientId || null,
        messageId: persistedMessage.id,
        touchType: "MANUAL_OUTBOUND",
        touchReason: "manual_send",
        channel: platform || "UNKNOWN",
        actor: sender,
        source: "MANUAL",
        traceId: clientMessageId || null,
        providerMessageId: delivery?.providerMessageId || null,
        outboundKey,
        deliveryState: delivery?.delivered ? "CONFIRMED" : "FAILED",
        providerAcceptedAt: delivery?.acceptedAt ? new Date(delivery.acceptedAt) : null,
        providerMessagePersistedAt:
          delivery?.providerMessageId && delivery.delivered ? new Date() : null,
        confirmedAt: delivery?.delivered ? new Date() : null,
        failedAt: delivery && !delivery.delivered ? new Date() : null,
        cta:
          typeof getMessageMetadata(persistedMessage.metadata).cta === "string"
            ? String(getMessageMetadata(persistedMessage.metadata).cta)
            : null,
        angle: null,
        leadState: null,
        messageType: "MANUAL_OUTBOUND",
        metadata: getMessageMetadata(persistedMessage.metadata),
      });
    }

    if (outboundKey && delivery?.delivered && lead.businessId) {
      const takeoverTarget = await resolveHumanTakeoverTarget({
        lead,
        requestedInteractionId: humanTakeover?.interactionId,
      });

      if (takeoverTarget?.interactionId) {
        const takeoverLedger = createTakeoverLedgerService();
        const humanId = String(
          humanTakeover?.humanId || takeoverTarget.assignedHumanId || ""
        ).trim();

        if (humanId) {
          const resolved = Boolean(humanTakeover?.resolved);
          const resolutionCode =
            typeof humanTakeover?.resolutionCode === "string"
              ? humanTakeover.resolutionCode.trim() || null
              : null;

          await takeoverLedger.recordHumanOutbound({
            interactionId: takeoverTarget.interactionId,
            humanId,
            outboundKey,
            messageId: persistedMessage.id,
            channel: platform || "UNKNOWN",
            content,
            resolutionCode,
            resolved,
            metadata: {
              source: "manual_conversation_send",
            },
          });

          if (resolved) {
            await takeoverLedger.releaseTakeover({
              interactionId: takeoverTarget.interactionId,
              assignedTo: humanId,
              outcome:
                (typeof humanTakeover?.releaseOutcome === "string"
                  ? humanTakeover.releaseOutcome.trim()
                  : "") ||
                resolutionCode ||
                "RESOLVED_BY_HUMAN",
              metadata: {
                source: "manual_conversation_send",
              },
            });
          }
        }
      }
    }

    await cancelFollowups(lead.id).catch((error) => {
      logger.warn(
        {
          leadId: lead.id,
          error,
        },
        "Follow-up cancellation failed after manual message"
      );
    });
  }

  if (sender !== "USER" && outboundKey && sender !== "AGENT") {
    await upsertRevenueTouchLedger({
      businessId: lead.businessId || "",
      leadId: lead.id,
      clientId: lead.clientId || null,
      messageId: persistedMessage.id,
      touchType: "AI_REPLY",
      touchReason: "conversation_send",
      channel: platform || "UNKNOWN",
      actor: sender,
      source: "API",
      traceId: clientMessageId || null,
      providerMessageId: delivery?.providerMessageId || null,
      outboundKey,
      deliveryState: "CONFIRMED",
      providerAcceptedAt: delivery?.acceptedAt ? new Date(delivery.acceptedAt) : null,
      providerMessagePersistedAt: delivery?.providerMessageId ? new Date() : null,
      confirmedAt: new Date(),
      deliveredAt: null,
      failedAt: null,
      cta:
        typeof getMessageMetadata(persistedMessage.metadata).cta === "string"
          ? String(getMessageMetadata(persistedMessage.metadata).cta)
          : null,
      angle: null,
      leadState: null,
      messageType: "AI_REPLY",
      metadata: getMessageMetadata(persistedMessage.metadata),
    }).catch((error) => {
      logger.error(
        {
          leadId: lead.id,
          messageId: persistedMessage.id,
          outboundKey,
          error,
        },
        "Canonical touch ledger write failed after manual conversation send"
      );
      throw error;
    });
  }

  await prisma.lead.update({
    where: {
      id: lead.id,
    },
    data: {
      lastMessageAt: new Date(),
      unreadCount: sender === "USER" ? { increment: 1 } : 0,
    },
  });

  const realtimeMessage = formatConversationMessage(persistedMessage);
  const shouldEmitRealtime = sender !== "AGENT" || delivery?.delivered;

  if (shouldEmitRealtime) {
    try {
      const io = getIO();
      io.to(`lead_${lead.id}`).emit("new_message", realtimeMessage);
    } catch (error) {
      logger.debug(
        {
          leadId: lead.id,
          error,
        },
        "Socket emit skipped for conversation message"
      );
    }
  }

  return {
    message: realtimeMessage,
    delivery,
  };
};
