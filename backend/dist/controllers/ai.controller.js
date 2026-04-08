"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testAI = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const ai_service_1 = require("../services/ai.service");
const normalizeMessage = (message) => message?.trim() || "";
const testAI = async (req, res) => {
    try {
        const message = normalizeMessage(req.body.message);
        if (!message) {
            return res.status(400).json({ message: "Message required" });
        }
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const business = await prisma_1.default.business.findFirst({
            where: {
                ownerId: userId,
            },
        });
        if (!business) {
            return res.status(404).json({ message: "Business not found" });
        }
        const lead = await prisma_1.default.lead.create({
            data: {
                businessId: business.id,
                name: "Test Lead",
                platform: "TEST",
            },
        });
        const reply = await (0, ai_service_1.generateAIReply)({
            businessId: business.id,
            leadId: lead.id,
            message,
        });
        return res.json({
            success: true,
            aiReply: reply,
            leadId: lead.id,
        });
    }
    catch (error) {
        console.error("AI Test Error:", error);
        return res.status(500).json({
            success: false,
            message: "AI test failed",
            error: error.message,
        });
    }
};
exports.testAI = testAI;
