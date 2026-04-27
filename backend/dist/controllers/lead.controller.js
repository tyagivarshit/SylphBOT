"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLeadControlState = exports.toggleHumanControl = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const leadControlState_service_1 = require("../services/leadControlState.service");
/* ======================================================
TOGGLE HUMAN CONTROL (AI ↔ HUMAN SWITCH)
====================================================== */
const toggleHumanControl = async (req, res) => {
    try {
        const { leadId, forceState } = req.body;
        const businessId = req.user?.businessId;
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
        if (typeof forceState === "boolean") {
            nextState = forceState; // direct control (UI toggle)
        }
        else {
            nextState = !lead.isHumanActive; // toggle fallback
        }
        /* ======================================================
        UPDATE LEAD
        ====================================================== */
        const updated = await prisma_1.default.lead.update({
            where: { id: String(leadId) },
            data: {
                isHumanActive: nextState,
            },
        });
        if (nextState) {
            await (0, leadControlState_service_1.markLeadHumanTakeover)({
                leadId: String(leadId),
                businessId: String(businessId),
            }).catch(() => undefined);
        }
        /* ======================================================
        SOCKET BROADCAST (REAL-TIME UI UPDATE)
        ====================================================== */
        req.app.get("io")?.to(leadId).emit("control_update", {
            leadId,
            isHumanActive: updated.isHumanActive,
        });
        /* ======================================================
        RESPONSE
        ====================================================== */
        return res.json({
            success: true,
            mode: updated.isHumanActive ? "HUMAN" : "AI",
            isHumanActive: updated.isHumanActive,
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
        return res.json({
            success: true,
            isHumanActive: lead.isHumanActive,
            mode: lead.isHumanActive ? "HUMAN" : "AI",
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
