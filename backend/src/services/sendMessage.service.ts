import axios from "axios";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { cancelFollowups } from "../queues/followup.queue";
import { getIO } from "../sockets/socket.server";
import { decrypt } from "../utils/encrypt";
import logger from "../utils/logger";

export type SupportedMessageSender = "USER" | "AI" | "AGENT";
export type SupportedOutboundPlatform = "INSTAGRAM" | "WHATSAPP";

type MessageMetadata = Record<string, unknown>;

type LeadMessageTarget = {
  id: string;
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
  await axios.post(
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
  await axios.post(
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

      await sendInstagramMessage({
        recipientId: lead.instagramId,
        message,
        accessToken,
      });

      return {
        delivered: true,
        platform,
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

    await sendWhatsAppMessage({
      phoneNumberId: lead.client.phoneNumberId,
      to: lead.phone,
      message,
      accessToken,
    });

    return {
      delivered: true,
      platform,
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
}: {
  existingMetadata?: unknown;
  clientMessageId?: string | null;
  platform?: string | null;
  delivery?: OutboundDeliveryResult | null;
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

  if (delivery) {
    metadata.delivery = {
      status: delivery.delivered ? "DELIVERED" : "FAILED",
      platform: delivery.platform,
      reason: delivery.reason || null,
      error: delivery.error || null,
      attemptedAt: new Date().toISOString(),
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

  if (sender === "AGENT") {
    delivery = await deliverLeadMessage({
      lead,
      message: content,
    });

    const updatedMetadata = buildMessageMetadata({
      existingMetadata: createdMessage.metadata,
      clientMessageId,
      platform,
      delivery,
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
