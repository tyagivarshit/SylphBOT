"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendAIFollowup = void 0;
const whatsapp_service_1 = require("./whatsapp.service");
const prisma_1 = __importDefault(require("../config/prisma"));
/*
=========================================================
AI FOLLOWUP ENGINE
=========================================================
*/
const sendAIFollowup = async (leadId) => {
    try {
        const lead = await prisma_1.default.lead.findUnique({
            where: { id: leadId },
        });
        if (!lead?.phone)
            return;
        const message = `Hey ${lead.name || ""} 👋

Just checking in!

Would you like to:
1. Book a call
2. Know more
3. Talk to a human

Reply with 1, 2, or 3 👍`;
        await (0, whatsapp_service_1.sendWhatsAppMessage)({
            to: lead.phone,
            message,
        });
    }
    catch (err) {
        console.error("❌ AI FOLLOWUP ERROR:", err);
    }
};
exports.sendAIFollowup = sendAIFollowup;
