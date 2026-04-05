"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWhatsAppMessage = exports.sendInstagramMessage = void 0;
const axios_1 = __importDefault(require("axios"));
const sendInstagramMessage = async ({ recipientId, message, accessToken, }) => {
    await axios_1.default.post(`https://graph.facebook.com/v18.0/me/messages`, {
        recipient: { id: recipientId },
        message: { text: message },
    }, {
        params: { access_token: accessToken },
    });
};
exports.sendInstagramMessage = sendInstagramMessage;
const sendWhatsAppMessage = async ({ phoneNumberId, to, message, accessToken, }) => {
    await axios_1.default.post(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message },
    }, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });
};
exports.sendWhatsAppMessage = sendWhatsAppMessage;
