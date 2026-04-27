"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistAndDispatchLeadMessage = exports.deliverLeadMessage = exports.sendWhatsAppMessage = exports.sendInstagramMessage = exports.formatConversationMessage = void 0;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = __importDefault(require("../config/prisma"));
const followup_queue_1 = require("../queues/followup.queue");
const socket_server_1 = require("../sockets/socket.server");
const consentAuthority_service_1 = require("./consentAuthority.service");
const leadControlState_service_1 = require("./leadControlState.service");
const revenueTouchLedger_service_1 = require("./revenueTouchLedger.service");
const encrypt_1 = require("../utils/encrypt");
const logger_1 = __importDefault(require("../utils/logger"));
const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const normalizePlatform = (platform) => {
    const normalizedPlatform = String(platform || "")
        .trim()
        .toUpperCase();
    if (normalizedPlatform === "INSTAGRAM" || normalizedPlatform === "WHATSAPP") {
        return normalizedPlatform;
    }
    return null;
};
const getMessageMetadata = (metadata) => isRecord(metadata) ? metadata : {};
const getDeliveryErrorMessage = (error) => {
    if (axios_1.default.isAxiosError(error)) {
        const responseData = error.response?.data;
        if (isRecord(responseData)) {
            const nestedError = responseData.error;
            if (isRecord(nestedError)) {
                const errorMessage = nestedError.error_user_msg ||
                    nestedError.message ||
                    responseData.message;
                if (typeof errorMessage === "string" && errorMessage.trim()) {
                    return errorMessage;
                }
            }
            if (typeof responseData.message === "string" &&
                responseData.message.trim()) {
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
const extractProviderMessageId = (value) => {
    if (!isRecord(value)) {
        return null;
    }
    if (typeof value.message_id === "string" && value.message_id.trim()) {
        return value.message_id.trim();
    }
    if (Array.isArray(value.messages)) {
        const first = value.messages.find((message) => isRecord(message) && typeof message.id === "string");
        if (typeof first?.id === "string" && first.id.trim()) {
            return first.id.trim();
        }
    }
    return null;
};
const formatConversationMessage = (message) => {
    const metadata = getMessageMetadata(message.metadata);
    const cta = typeof metadata.cta === "string" ? metadata.cta : null;
    return {
        ...message,
        metadata,
        cta,
    };
};
exports.formatConversationMessage = formatConversationMessage;
const sendInstagramMessage = async ({ recipientId, message, accessToken, }) => {
    const response = await axios_1.default.post("https://graph.facebook.com/v19.0/me/messages", {
        recipient: { id: recipientId },
        message: { text: message },
    }, {
        timeout: 10000,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
    });
    return {
        providerMessageId: extractProviderMessageId(response.data),
    };
};
exports.sendInstagramMessage = sendInstagramMessage;
const sendWhatsAppMessage = async ({ phoneNumberId, to, message, accessToken, }) => {
    const response = await axios_1.default.post(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message },
    }, {
        timeout: 10000,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
    });
    return {
        providerMessageId: extractProviderMessageId(response.data),
    };
};
exports.sendWhatsAppMessage = sendWhatsAppMessage;
const deliverLeadMessage = async ({ lead, message, }) => {
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
    const accessToken = (0, encrypt_1.decrypt)(lead.client.accessToken);
    if (!accessToken) {
        return {
            delivered: false,
            platform,
            reason: "INVALID_ACCESS_TOKEN",
            error: "Unable to decrypt channel access token",
        };
    }
    if (lead.businessId &&
        (await (0, consentAuthority_service_1.isConsentRevoked)({
            businessId: lead.businessId,
            leadId: lead.id,
            channel: platform,
            scope: "CONVERSATIONAL_OUTBOUND",
        }))) {
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
            const result = await (0, exports.sendInstagramMessage)({
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
        const result = await (0, exports.sendWhatsAppMessage)({
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
    }
    catch (error) {
        const errorMessage = getDeliveryErrorMessage(error);
        logger_1.default.error({
            leadId: lead.id,
            platform,
            error,
        }, "Outbound message delivery failed");
        return {
            delivered: false,
            platform,
            reason: "DELIVERY_FAILED",
            error: errorMessage,
        };
    }
};
exports.deliverLeadMessage = deliverLeadMessage;
const buildMessageMetadata = ({ existingMetadata, clientMessageId, platform, delivery, outboundKey, }) => {
    const metadata = {
        ...getMessageMetadata(existingMetadata),
    };
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
const persistAndDispatchLeadMessage = async ({ lead, content, sender, clientMessageId, }) => {
    const platform = normalizePlatform(lead.platform || lead.client?.platform);
    const initialMetadata = buildMessageMetadata({
        clientMessageId,
        platform,
    });
    const createdMessage = await prisma_1.default.message.create({
        data: {
            content,
            sender,
            lead: {
                connect: {
                    id: lead.id,
                },
            },
            ...(initialMetadata
                ? { metadata: initialMetadata }
                : {}),
        },
    });
    let delivery = null;
    let persistedMessage = createdMessage;
    const outboundKey = sender === "USER"
        ? null
        : (0, revenueTouchLedger_service_1.buildRevenueTouchOutboundKey)({
            source: sender === "AGENT" ? "MANUAL" : sender,
            leadId: lead.id,
            clientMessageId,
            messageId: createdMessage.id,
        });
    if (sender === "AGENT") {
        await (0, leadControlState_service_1.bumpLeadCancelToken)({
            leadId: lead.id,
            businessId: lead.businessId || null,
            lastManualOutboundAt: new Date(),
            metadata: {
                reason: "manual_send",
                outboundKey,
            },
        });
        if (outboundKey) {
            await (0, revenueTouchLedger_service_1.upsertRevenueTouchLedger)({
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
                cta: typeof getMessageMetadata(createdMessage.metadata).cta === "string"
                    ? String(getMessageMetadata(createdMessage.metadata).cta)
                    : null,
                angle: null,
                leadState: null,
                messageType: "MANUAL_OUTBOUND",
                metadata: getMessageMetadata(createdMessage.metadata),
            });
        }
        const existingTouch = outboundKey
            ? await (0, revenueTouchLedger_service_1.findRevenueTouchLedgerByOutboundKey)(outboundKey)
            : null;
        if (existingTouch &&
            (0, revenueTouchLedger_service_1.isRevenueTouchStateAtLeast)(existingTouch.deliveryState, "PROVIDER_MESSAGE_ID_PERSISTED")) {
            delivery = {
                delivered: true,
                platform,
                providerMessageId: existingTouch.providerMessageId || null,
                acceptedAt: existingTouch.providerAcceptedAt?.toISOString() ||
                    new Date().toISOString(),
            };
        }
        else {
            delivery = await (0, exports.deliverLeadMessage)({
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
            await (0, revenueTouchLedger_service_1.upsertRevenueTouchLedger)({
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
                cta: typeof getMessageMetadata(createdMessage.metadata).cta === "string"
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
            await (0, revenueTouchLedger_service_1.upsertRevenueTouchLedger)({
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
                cta: typeof getMessageMetadata(createdMessage.metadata).cta === "string"
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
        persistedMessage = await prisma_1.default.message.update({
            where: { id: createdMessage.id },
            data: {
                metadata: updatedMetadata,
            },
        });
        if (outboundKey) {
            await (0, revenueTouchLedger_service_1.upsertRevenueTouchLedger)({
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
                providerMessagePersistedAt: delivery?.providerMessageId && delivery.delivered ? new Date() : null,
                confirmedAt: delivery?.delivered ? new Date() : null,
                failedAt: delivery && !delivery.delivered ? new Date() : null,
                cta: typeof getMessageMetadata(persistedMessage.metadata).cta === "string"
                    ? String(getMessageMetadata(persistedMessage.metadata).cta)
                    : null,
                angle: null,
                leadState: null,
                messageType: "MANUAL_OUTBOUND",
                metadata: getMessageMetadata(persistedMessage.metadata),
            });
        }
        await (0, followup_queue_1.cancelFollowups)(lead.id).catch((error) => {
            logger_1.default.warn({
                leadId: lead.id,
                error,
            }, "Follow-up cancellation failed after manual message");
        });
    }
    if (sender !== "USER" && outboundKey && sender !== "AGENT") {
        await (0, revenueTouchLedger_service_1.upsertRevenueTouchLedger)({
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
            cta: typeof getMessageMetadata(persistedMessage.metadata).cta === "string"
                ? String(getMessageMetadata(persistedMessage.metadata).cta)
                : null,
            angle: null,
            leadState: null,
            messageType: "AI_REPLY",
            metadata: getMessageMetadata(persistedMessage.metadata),
        }).catch((error) => {
            logger_1.default.error({
                leadId: lead.id,
                messageId: persistedMessage.id,
                outboundKey,
                error,
            }, "Canonical touch ledger write failed after manual conversation send");
            throw error;
        });
    }
    await prisma_1.default.lead.update({
        where: {
            id: lead.id,
        },
        data: {
            lastMessageAt: new Date(),
            unreadCount: sender === "USER" ? { increment: 1 } : 0,
        },
    });
    const realtimeMessage = (0, exports.formatConversationMessage)(persistedMessage);
    const shouldEmitRealtime = sender !== "AGENT" || delivery?.delivered;
    if (shouldEmitRealtime) {
        try {
            const io = (0, socket_server_1.getIO)();
            io.to(`lead_${lead.id}`).emit("new_message", realtimeMessage);
        }
        catch (error) {
            logger_1.default.debug({
                leadId: lead.id,
                error,
            }, "Socket emit skipped for conversation message");
        }
    }
    return {
        message: realtimeMessage,
        delivery,
    };
};
exports.persistAndDispatchLeadMessage = persistAndDispatchLeadMessage;
