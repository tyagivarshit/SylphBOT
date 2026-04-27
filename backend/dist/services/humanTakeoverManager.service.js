"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoDisableHumanAfterTimeout = exports.deactivateHuman = exports.activateHuman = exports.isHumanActive = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const leadControlState_service_1 = require("./leadControlState.service");
const isHumanActive = async (leadId) => {
    try {
        const lead = await prisma_1.default.lead.findUnique({
            where: { id: leadId },
            select: { isHumanActive: true },
        });
        return lead?.isHumanActive || false;
    }
    catch (error) {
        console.error("HUMAN CHECK ERROR:", error);
        return false;
    }
};
exports.isHumanActive = isHumanActive;
const activateHuman = async (leadId) => {
    try {
        const lead = await prisma_1.default.lead.update({
            where: { id: leadId },
            data: {
                isHumanActive: true,
            },
            select: {
                businessId: true,
            },
        });
        await (0, leadControlState_service_1.markLeadHumanTakeover)({
            leadId,
            businessId: lead.businessId,
        }).catch(() => undefined);
    }
    catch (error) {
        console.error("ACTIVATE HUMAN ERROR:", error);
        throw error;
    }
};
exports.activateHuman = activateHuman;
const deactivateHuman = async (leadId) => {
    try {
        await prisma_1.default.lead.update({
            where: { id: leadId },
            data: {
                isHumanActive: false,
            },
        });
    }
    catch (error) {
        console.error("DEACTIVATE HUMAN ERROR:", error);
        throw error;
    }
};
exports.deactivateHuman = deactivateHuman;
/* 🔥 AUTO SWITCH BACK TO AI AFTER INACTIVITY */
const autoDisableHumanAfterTimeout = async (leadId, timeoutMinutes = 10) => {
    try {
        const lead = await prisma_1.default.lead.findUnique({
            where: { id: leadId },
            select: {
                lastMessageAt: true,
                isHumanActive: true,
            },
        });
        if (!lead || !lead.isHumanActive)
            return;
        const last = new Date(lead.lastMessageAt || 0).getTime();
        const now = Date.now();
        const diffMinutes = (now - last) / (1000 * 60);
        if (diffMinutes >= timeoutMinutes) {
            await (0, exports.deactivateHuman)(leadId);
        }
    }
    catch (error) {
        console.error("AUTO HUMAN TIMEOUT ERROR:", error);
    }
};
exports.autoDisableHumanAfterTimeout = autoDisableHumanAfterTimeout;
