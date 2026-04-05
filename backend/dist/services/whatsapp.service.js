"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWhatsAppTemplate = exports.sendWhatsAppMessage = void 0;
const twilio_1 = __importDefault(require("twilio"));
const env_1 = require("../config/env");
/*
=========================================================
WHATSAPP SERVICE (PRODUCTION READY)
Supports:
- Text messages
- Fail-safe handling
- Logging
=========================================================
*/
// 🔥 Init Twilio
const client = (0, twilio_1.default)(env_1.env.TWILIO_ACCOUNT_SID, env_1.env.TWILIO_AUTH_TOKEN);
/*
=========================================================
FORMAT PHONE NUMBER (IMPORTANT)
=========================================================
*/
const formatWhatsAppNumber = (phone) => {
    // remove spaces, dashes etc
    let cleaned = phone.replace(/\D/g, "");
    // अगर India number hai (10 digit)
    if (cleaned.length === 10) {
        cleaned = "91" + cleaned;
    }
    return `whatsapp:+${cleaned}`;
};
/*
=========================================================
SEND WHATSAPP MESSAGE
=========================================================
*/
const sendWhatsAppMessage = async ({ to, message, }) => {
    try {
        if (!to) {
            console.log("❌ WhatsApp: No phone number provided");
            return false;
        }
        const formattedTo = formatWhatsAppNumber(to);
        const response = await client.messages.create({
            from: `whatsapp:${env_1.env.TWILIO_WHATSAPP_NUMBER}`, // e.g. whatsapp:+14155238886
            to: formattedTo,
            body: message,
        });
        console.log("✅ WhatsApp sent:", response.sid);
        return true;
    }
    catch (error) {
        console.error("❌ WhatsApp send error:", error?.message || error);
        return false;
    }
};
exports.sendWhatsAppMessage = sendWhatsAppMessage;
/*
=========================================================
ADVANCED: TEMPLATE MESSAGE (OPTIONAL)
=========================================================
*/
const sendWhatsAppTemplate = async ({ to, templateName, variables, }) => {
    try {
        const formattedTo = formatWhatsAppNumber(to);
        const response = await client.messages.create({
            from: `whatsapp:${env_1.env.TWILIO_WHATSAPP_NUMBER}`,
            to: formattedTo,
            contentSid: templateName, // Twilio template SID
            contentVariables: JSON.stringify(variables || []),
        });
        console.log("✅ WhatsApp template sent:", response.sid);
        return true;
    }
    catch (error) {
        console.error("❌ Template send error:", error?.message || error);
        return false;
    }
};
exports.sendWhatsAppTemplate = sendWhatsAppTemplate;
