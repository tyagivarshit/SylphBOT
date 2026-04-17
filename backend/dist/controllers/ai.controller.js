"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testAI = exports.getSalesBlueprint = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const blueprint_service_1 = require("../services/salesAgent/blueprint.service");
const reply_service_1 = require("../services/salesAgent/reply.service");
const normalizeMessage = (message) => message?.trim() || "";
const getBusinessForUser = async (userId) => {
    if (!userId) {
        return null;
    }
    return prisma_1.default.business.findFirst({
        where: {
            ownerId: userId,
        },
        include: {
            subscription: {
                include: {
                    plan: true,
                },
            },
        },
    });
};
const getSalesBlueprint = async (_req, res) => {
    return res.json({
        success: true,
        blueprint: (0, blueprint_service_1.getSalesAgentBlueprint)(),
    });
};
exports.getSalesBlueprint = getSalesBlueprint;
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
        const business = await getBusinessForUser(userId);
        if (!business) {
            return res.status(404).json({ message: "Business not found" });
        }
        if (req.body.clientId) {
            const client = await prisma_1.default.client.findFirst({
                where: {
                    id: req.body.clientId,
                    businessId: business.id,
                    isActive: true,
                },
                select: {
                    id: true,
                },
            });
            if (!client) {
                return res.status(404).json({ message: "Client not found" });
            }
        }
        const lead = (req.body.leadId
            ? await prisma_1.default.lead.findFirst({
                where: {
                    id: req.body.leadId,
                    businessId: business.id,
                },
            })
            : null) ||
            (await prisma_1.default.lead.create({
                data: {
                    businessId: business.id,
                    clientId: req.body.clientId || null,
                    name: "Test Lead",
                    platform: "TEST",
                },
            }));
        const reply = await (0, reply_service_1.generateSalesAgentReply)({
            businessId: business.id,
            leadId: lead.id,
            message,
            plan: business.subscription?.plan || null,
            source: "PREVIEW",
            preview: true,
        });
        return res.json({
            success: true,
            aiReply: reply?.message || null,
            payload: reply,
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
