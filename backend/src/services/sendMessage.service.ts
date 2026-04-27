import axios from "axios";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { cancelFollowups } from "../queues/followup.queue";
import { getIO } from "../sockets/socket.server";
import { isConsentRevoked } from "./consentAuthority.service";
import { bumpLeadCancelToken } from "./leadControlState.service";
import {
  buildRevenueTouchOutboundKey,
  upsertRevenueTouchLedger,
} from "./revenueTouchLedger.service";
import { decrypt } from "../utils/encrypt";
import logger from "../utils/logger";

export type SupportedMessageSender = "USER" | "AI" | "AGENT";
export type SupportedOutboundPlatform = "INSTAGRAM" | "WHATSAPP";

type MessageMetadata = Record<string, unknown>;

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

      return {
        delivered: true,
        platform,
        providerMessageId: result.providerMessageId || null,
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

    return {
      delivered: true,
      platform,
      providerMessageId: result.providerMessageId || null,
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
      status: delivery.delivered ? "DELIVERED" : "FAILED",
      platform: delivery.platform,
      providerMessageId: delivery.providerMessageId || null,
      reason: delivery.reason || null,
      error: delivery.error || null,
      attemptedAt: delivery.acceptedAt || new Date().toISOString(),
    };
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

export const persistAndDispatchLeadMessage = async ({
  lead,
  content,
  sender,
  clientMessageId,
}: {
  lead: LeadMessageTarget;
  content: string;
  sender: SupportedMessageSender;
  clientMessageId?: string | null;
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
    }).catch((error) => {
      logger.warn(
        {
          leadId: lead.id,
          error,
        },
        "Lead cancel token bump failed before manual outbound send"
      );
    });

    delivery = await deliverLeadMessage({
      lead,
      message: content,
    });

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

  if (sender !== "USER" && outboundKey) {
    const touchState =
      sender === "AGENT"
        ? delivery?.delivered
          ? "DELIVERED"
          : "FAILED"
        : "CONFIRMED";

    await upsertRevenueTouchLedger({
      businessId: lead.businessId || "",
      leadId: lead.id,
      clientId: lead.clientId || null,
      messageId: persistedMessage.id,
      touchType: sender === "AGENT" ? "MANUAL_OUTBOUND" : "AI_REPLY",
      touchReason: sender === "AGENT" ? "manual_send" : "conversation_send",
      channel: platform || "UNKNOWN",
      actor: sender,
      source: sender === "AGENT" ? "MANUAL" : "API",
      traceId: clientMessageId || null,
      providerMessageId: delivery?.providerMessageId || null,
      outboundKey,
      deliveryState: touchState,
      providerAcceptedAt: delivery?.acceptedAt ? new Date(delivery.acceptedAt) : null,
      providerMessagePersistedAt: delivery?.providerMessageId ? new Date() : null,
      confirmedAt: new Date(),
      deliveredAt:
        delivery?.delivered && delivery.acceptedAt
          ? new Date(delivery.acceptedAt)
          : null,
      failedAt:
        sender === "AGENT" && delivery && !delivery.delivered ? new Date() : null,
      cta:
        typeof getMessageMetadata(persistedMessage.metadata).cta === "string"
          ? String(getMessageMetadata(persistedMessage.metadata).cta)
          : null,
      angle: null,
      leadState: null,
      messageType: sender === "AGENT" ? "MANUAL_OUTBOUND" : "AI_REPLY",
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
