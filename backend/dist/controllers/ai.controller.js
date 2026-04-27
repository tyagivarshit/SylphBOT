"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testAI = exports.getSalesBlueprint = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const blueprint_service_1 = require("../services/salesAgent/blueprint.service");
const reply_service_1 = require("../services/salesAgent/reply.service");
const orchestrator_service_1 = require("../services/revenueBrain/orchestrator.service");
const usage_service_1 = require("../services/usage.service");
const runtimePolicy_service_1 = require("../services/runtimePolicy.service");
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
    let aiReservation = null;
    let responseLeadId = null;
    try {
        if (!(0, runtimePolicy_service_1.isPhase5APreviewBypassEnabled)()) {
            return res.status(410).json({
                success: false,
                message: "Preview Revenue Brain access is disabled in production. Use the canonical reception runtime.",
            });
        }
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
            (await (0, usage_service_1.runWithContactUsageLimit)(business.id, (tx) => tx.lead.create({
                data: {
                    businessId: business.id,
                    clientId: req.body.clientId || null,
                    name: "Test Lead",
                    platform: "TEST",
                },
            }))).result;
        responseLeadId = lead.id;
        const reply = await (0, orchestrator_service_1.runRevenueBrainOrchestrator)({
            businessId: business.id,
            leadId: lead.id,
            message,
            plan: business.subscription?.plan || null,
            source: "PREVIEW",
            preview: true,
            beforeAIReply: async () => {
                aiReservation = await (0, usage_service_1.reserveAIUsageExecution)({
                    businessId: business.id,
                });
                return {
                    finalize: async () => {
                        if (!aiReservation) {
                            return;
                        }
                        const activeReservation = aiReservation;
                        aiReservation = null;
                        await (0, usage_service_1.finalizeAIUsageExecution)(activeReservation);
                    },
                    release: async () => {
                        if (!aiReservation) {
                            return;
                        }
                        const activeReservation = aiReservation;
                        aiReservation = null;
                        await (0, usage_service_1.releaseAIUsageExecution)(activeReservation);
                    },
                };
            },
        });
        if (!reply?.message) {
            return res.json({
                success: true,
                aiReply: null,
                payload: reply?.structured || null,
                internalPayload: reply || null,
                leadId: responseLeadId,
            });
        }
        return res.json({
            success: true,
            aiReply: reply.message,
            payload: reply.structured || null,
            internalPayload: reply,
            leadId: responseLeadId,
        });
    }
    catch (error) {
        if (aiReservation) {
            await (0, usage_service_1.releaseAIUsageExecution)(aiReservation).catch(() => undefined);
            aiReservation = null;
        }
        if (error?.code === "LIMIT_REACHED") {
            return res.status(429).json({
                success: false,
                message: "Usage limit reached",
            });
        }
        if (error?.code === "HOURLY_LIMIT_REACHED") {
            const fallback = (0, reply_service_1.buildSalesAgentRecoveryReply)(normalizeMessage(req.body.message));
            return res.json({
                success: true,
                aiReply: fallback.message,
                payload: fallback.structured || null,
                internalPayload: fallback,
                leadId: responseLeadId,
            });
        }
        if (error?.code === "USAGE_CHECK_FAILED") {
            return res.status(503).json({
                success: false,
                message: "AI temporarily unavailable",
            });
        }
        console.error("AI Test Error:", error);
        return res.status(500).json({
            success: false,
            message: "AI test failed",
            error: error.message,
        });
    }
};
exports.testAI = testAI;
