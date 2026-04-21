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
    await axios_1.default.post("https://graph.facebook.com/v19.0/me/messages", {
        recipient: { id: recipientId },
        message: { text: message },
    }, {
        timeout: 10000,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
    });
};
exports.sendInstagramMessage = sendInstagramMessage;
const sendWhatsAppMessage = async ({ phoneNumberId, to, message, accessToken, }) => {
    await axios_1.default.post(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
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
            await (0, exports.sendInstagramMessage)({
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
        await (0, exports.sendWhatsAppMessage)({
            phoneNumberId: lead.client.phoneNumberId,
            to: lead.phone,
            message,
            accessToken,
        });
        return {
            delivered: true,
            platform,
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
const buildMessageMetadata = ({ existingMetadata, clientMessageId, platform, delivery, }) => {
    const metadata = {
        ...getMessageMetadata(existingMetadata),
    };
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
    if (sender === "AGENT") {
        delivery = await (0, exports.deliverLeadMessage)({
            lead,
            message: content,
        });
        const updatedMetadata = buildMessageMetadata({
            existingMetadata: createdMessage.metadata,
            clientMessageId,
            platform,
            delivery,
        });
        persistedMessage = await prisma_1.default.message.update({
            where: { id: createdMessage.id },
            data: {
                metadata: updatedMetadata,
            },
        });
        await (0, followup_queue_1.cancelFollowups)(lead.id).catch((error) => {
            logger_1.default.warn({
                leadId: lead.id,
                error,
            }, "Follow-up cancellation failed after manual message");
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
