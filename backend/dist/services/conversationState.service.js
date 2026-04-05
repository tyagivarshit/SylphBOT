"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRawState = exports.clearConversationState = exports.updateConversationState = exports.setConversationState = exports.getConversationState = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
/* =====================================================
STRICT HELPERS (NO SILENT FAILS)
===================================================== */
/* 🔥 ALWAYS PARSE STRING → OBJECT (FIXED) */
const parseContext = (data) => {
    if (!data)
        return {};
    try {
        let parsed = typeof data === "string"
            ? JSON.parse(data)
            : JSON.parse(JSON.stringify(data));
        /* 🔥 FIX: HANDLE OLD NESTED STRUCTURE */
        if (parsed?.context && typeof parsed.context === "object") {
            parsed = parsed.context;
        }
        return parsed;
    }
    catch (err) {
        console.error("CONTEXT PARSE ERROR:", err);
        return {};
    }
};
/* 🔥 ALWAYS STORE STRING */
const stringifyContext = (data) => {
    try {
        if (!data)
            return JSON.stringify({});
        return JSON.stringify(data);
    }
    catch (err) {
        console.error("CONTEXT STRINGIFY ERROR:", err);
        return JSON.stringify({});
    }
};
/* =====================================================
GET STATE (STRICT + SAFE)
===================================================== */
const getConversationState = async (leadId) => {
    if (!leadId)
        return null;
    const state = await prisma_1.default.conversationState.findUnique({
        where: { leadId },
    });
    if (!state)
        return null;
    /* 🔥 AUTO EXPIRE */
    if (state.expiresAt && new Date() > state.expiresAt) {
        await prisma_1.default.conversationState.delete({
            where: { leadId },
        });
        return null;
    }
    return {
        ...state,
        context: parseContext(state.context), // ALWAYS CLEAN OBJECT
    };
};
exports.getConversationState = getConversationState;
/* =====================================================
SET STATE (STRICT)
===================================================== */
const setConversationState = async (leadId, state, options = {}) => {
    if (!leadId)
        return null;
    const { context = {}, ttlMinutes = 15 } = options;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    try {
        return await prisma_1.default.conversationState.upsert({
            where: { leadId },
            update: {
                state,
                context: stringifyContext(context),
                expiresAt,
                updatedAt: new Date(),
            },
            create: {
                leadId,
                state,
                context: stringifyContext(context),
                expiresAt,
            },
        });
    }
    catch (error) {
        console.error("SET STATE ERROR:", error);
        return null;
    }
};
exports.setConversationState = setConversationState;
/* =====================================================
UPDATE STATE (SAFE MERGE)
===================================================== */
const updateConversationState = async (leadId, partialContext) => {
    if (!leadId)
        return null;
    const current = await (0, exports.getConversationState)(leadId);
    if (!current)
        return null;
    const updatedContext = {
        ...(current.context || {}),
        ...(partialContext || {}),
    };
    try {
        return await prisma_1.default.conversationState.update({
            where: { leadId },
            data: {
                context: stringifyContext(updatedContext),
                updatedAt: new Date(),
            },
        });
    }
    catch (error) {
        console.error("UPDATE STATE ERROR:", error);
        return null;
    }
};
exports.updateConversationState = updateConversationState;
/* =====================================================
CLEAR STATE
===================================================== */
const clearConversationState = async (leadId) => {
    if (!leadId)
        return;
    try {
        await prisma_1.default.conversationState.delete({
            where: { leadId },
        });
    }
    catch (error) {
        console.error("CLEAR STATE ERROR:", error);
    }
};
exports.clearConversationState = clearConversationState;
/* =====================================================
DEBUG
===================================================== */
const getRawState = async (leadId) => {
    return prisma_1.default.conversationState.findUnique({
        where: { leadId },
    });
};
exports.getRawState = getRawState;
