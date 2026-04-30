"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLeadControlState = exports.toggleHumanControl = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const leadControlState_service_1 = require("../services/leadControlState.service");
const consentAuthorityWriter_service_1 = require("../services/consentAuthorityWriter.service");
/* ======================================================
TOGGLE HUMAN CONTROL (AI ↔ HUMAN SWITCH)
====================================================== */
const toggleHumanControl = async (req, res) => {
    try {
        const { leadId, forceState, consentAction, consentScope, consentChannel, consentLegalBasis, consentReason, previousConsentScope, } = req.body;
        const businessId = req.user?.businessId;
        const userId = req.user?.id || null;
        if (!leadId) {
            return res.status(400).json({
                success: false,
                message: "leadId required",
            });
        }
        if (!businessId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        /* 🔥 FIND LEAD (SECURE BUSINESS CHECK) */
        const lead = await prisma_1.default.lead.findFirst({
            where: {
                id: String(leadId),
                businessId: String(businessId),
            },
            select: {
                id: true,
                platform: true,
            },
        });
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: "Lead not found",
            });
        }
        /* ======================================================
        DETERMINE NEXT STATE
        ====================================================== */
        let nextState;
        const controlState = await (0, leadControlState_service_1.getLeadControlAuthority)({
            leadId: String(leadId),
            businessId: String(businessId),
        });
        if (typeof forceState === "boolean") {
            nextState = forceState; // direct control (UI toggle)
        }
        else {
            nextState = !(0, leadControlState_service_1.isLeadHumanControlActive)(controlState); // toggle fallback
        }
        /* ======================================================
        UPDATE LEAD
        ====================================================== */
        const updatedControlState = await (0, leadControlState_service_1.setLeadHumanControl)({
            leadId: String(leadId),
            businessId: String(businessId),
            isActive: nextState,
        });
        const normalizedConsentAction = String(consentAction || "")
            .trim()
            .toUpperCase();
        if (["GRANT", "REVOKE", "UPDATE"].includes(normalizedConsentAction)) {
            const consentWriter = (0, consentAuthorityWriter_service_1.createConsentAuthorityWriterService)();
            const channel = String(consentChannel || lead.platform || "ALL").trim() || "ALL";
            const scope = String(consentScope || "CONVERSATIONAL_OUTBOUND").trim();
            const commonContext = {
                businessId: String(businessId),
                leadId: String(leadId),
                channel,
                scope,
                source: "OWNER_MANUAL_OVERRIDE",
                legalBasis: String(consentLegalBasis || "MANUAL_OVERRIDE").trim(),
                actor: userId,
                evidence: {
                    reason: String(consentReason || "manual_override"),
                    mode: nextState ? "HUMAN" : "AI",
                    trigger: "lead.toggle-control",
                },
            };
            if (normalizedConsentAction === "GRANT") {
                await consentWriter.grantConsent(commonContext);
            }
            else if (normalizedConsentAction === "REVOKE") {
                await consentWriter.revokeConsent(commonContext);
            }
            else {
                await consentWriter.updateConsentScope({
                    ...commonContext,
                    scope: String(previousConsentScope || scope || "CONVERSATIONAL_OUTBOUND").trim() ||
                        "CONVERSATIONAL_OUTBOUND",
                    nextScope: scope || "CONVERSATIONAL_OUTBOUND",
                });
            }
        }
        /* ======================================================
        SOCKET BROADCAST (REAL-TIME UI UPDATE)
        ====================================================== */
        req.app.get("io")?.to(leadId).emit("control_update", {
            leadId,
            isHumanActive: nextState,
        });
        /* ======================================================
        RESPONSE
        ====================================================== */
        return res.json({
            success: true,
            mode: nextState ? "HUMAN" : "AI",
            isHumanActive: nextState,
            cancelTokenVersion: updatedControlState.cancelTokenVersion,
        });
    }
    catch (error) {
        console.error("Toggle human error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to toggle mode",
        });
    }
};
exports.toggleHumanControl = toggleHumanControl;
/* ======================================================
GET LEAD CONTROL STATE
====================================================== */
const getLeadControlState = async (req, res) => {
    try {
        const { leadId } = req.params;
        const businessId = req.user?.businessId;
        if (!leadId) {
            return res.status(400).json({
                success: false,
                message: "leadId required",
            });
        }
        const lead = await prisma_1.default.lead.findFirst({
            where: {
                id: String(leadId),
                businessId: String(businessId),
            },
            select: {
                id: true,
                isHumanActive: true,
            },
        });
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: "Lead not found",
            });
        }
        const controlState = await (0, leadControlState_service_1.getLeadControlAuthority)({
            leadId: String(leadId),
            businessId: String(businessId),
        });
        const isHumanActive = (0, leadControlState_service_1.isLeadHumanControlActive)(controlState);
        return res.json({
            success: true,
            isHumanActive,
            mode: isHumanActive ? "HUMAN" : "AI",
            cancelTokenVersion: controlState?.cancelTokenVersion ?? 0,
            lastManualOutboundAt: controlState?.lastManualOutboundAt || null,
            lastHumanTakeoverAt: controlState?.lastHumanTakeoverAt || null,
        });
    }
    catch (error) {
        console.error("Get control state error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch control state",
        });
    }
};
exports.getLeadControlState = getLeadControlState;
