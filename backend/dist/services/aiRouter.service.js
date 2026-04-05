"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeAIMessage = void 0;
const aiIntentEngine_service_1 = require("./aiIntentEngine.service");
const aiBookingEngine_service_1 = require("./aiBookingEngine.service");
const conversationState_service_1 = require("./conversationState.service");
const aiFunnel_service_1 = require("./aiFunnel.service");
const humanTakeoverManager_service_1 = require("./humanTakeoverManager.service");
const rag_service_1 = require("./rag.service");
const smartFallback_service_1 = require("./smartFallback.service");
const prisma_1 = __importDefault(require("../config/prisma"));
/* 🔥 ADD */
const automationEngine_service_1 = require("./automationEngine.service");
/* ================================================= */
/* 🔥 STAGE ENGINE (UNCHANGED) */
const getStageFromHistory = async (leadId, message) => {
    const messages = await prisma_1.default.message.findMany({
        where: { leadId },
        orderBy: { createdAt: "asc" },
        take: 10,
    });
    const count = messages.length;
    const lower = message.toLowerCase();
    const intentSignals = [
        "price",
        "cost",
        "how much",
        "demo",
        "trial",
        "book",
        "call",
    ];
    const interestScore = intentSignals.reduce((acc, word) => {
        return lower.includes(word) ? acc + 1 : acc;
    }, 0);
    if (count <= 3 && interestScore === 0)
        return "COLD";
    if (count <= 7 || interestScore === 1)
        return "WARM";
    if (interestScore >= 2 || count > 7)
        return "HOT";
    return "COLD";
};
const getCTA = (stage) => {
    if (stage === "HOT")
        return "BOOK_NOW";
    return "NONE";
};
const isGreeting = (msg) => ["hi", "hello", "hey", "hii", "yo"].includes(msg);
const safe = async (fn, fallback) => {
    try {
        return await fn();
    }
    catch {
        return fallback;
    }
};
const coldPrompts = [
    "Got it 👍 can you tell me a bit more about your use case?",
    "Interesting 👀 what exactly are you trying to achieve?",
    "Okay, help me understand your requirement a bit better",
];
const warmPrompts = [
    "I can explain how this would work for you 👍",
    "Want me to break this down for your use case?",
    "I can show you how people usually use this",
];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
/* ================================================= */
const routeAIMessage = async ({ businessId, leadId, message, plan, }) => {
    try {
        const lowerMessage = message.toLowerCase().trim();
        const isBasic = plan?.type === "BASIC";
        const isPro = plan?.type === "PRO";
        const isElite = plan?.type === "ELITE";
        /* ================= HUMAN ================= */
        if (await (0, humanTakeoverManager_service_1.isHumanActive)(leadId))
            return null;
        /* ================= AUTOMATION FIRST ================= */
        const automationReply = await (0, automationEngine_service_1.runAutomationEngine)({
            businessId,
            leadId,
            message,
        });
        if (automationReply) {
            return {
                message: automationReply,
                cta: "NONE",
            };
        }
        /* ================= STAGE ================= */
        const stage = await getStageFromHistory(leadId, message);
        /* ================= GREETING ================= */
        if (isGreeting(lowerMessage)) {
            await (0, conversationState_service_1.clearConversationState)(leadId);
            return {
                message: "Hey 👋 how can I help you today?",
                cta: "NONE",
            };
        }
        /* ================= INTENT ================= */
        const intent = await safe(() => (0, aiIntentEngine_service_1.generateIntentReply)({
            businessId,
            leadId,
            message,
        }), null);
        /* ================= BOOKING ================= */
        const isBookingIntent = intent?.intent === "BOOKING";
        if (isBookingIntent && isElite && stage === "HOT") {
            const bookingResult = await safe(() => (0, aiBookingEngine_service_1.handleAIBookingIntent)(businessId, leadId, message), { handled: false, message: "" });
            if (bookingResult?.handled) {
                return { message: bookingResult.message, cta: "NONE" };
            }
        }
        /* =================================================
        🧠 RAG
        ================================================= */
        const ragResult = await safe(() => (0, rag_service_1.generateRAGReply)(businessId, message, leadId), { found: false, reply: null, context: "" });
        if (ragResult?.found && ragResult?.reply) {
            let base = ragResult.reply;
            /* 🟢 BASIC → LIGHT */
            if (isBasic) {
                return {
                    message: base + "\n\n" + pick(coldPrompts),
                    cta: "NONE",
                };
            }
            /* 🔵 PRO / 🔴 ELITE → FULL AI */
            if (stage === "COLD") {
                return {
                    message: base + "\n\n" + pick(coldPrompts),
                    cta: "NONE",
                };
            }
            if (stage === "WARM") {
                return {
                    message: base + "\n\n" + pick(warmPrompts),
                    cta: "NONE",
                };
            }
            if (stage === "HOT") {
                return {
                    message: base +
                        "\n\nMakes sense for you 👍 want me to set up a quick call?",
                    cta: isElite ? "BOOK_NOW" : "NONE",
                };
            }
        }
        /* =================================================
        🧲 FUNNEL (PRO + ELITE ONLY)
        ================================================= */
        if (!isBasic && stage !== "COLD") {
            const funnelReply = await safe(() => (0, aiFunnel_service_1.generateAIFunnelReply)({
                businessId,
                leadId,
                message,
            }), null);
            if (funnelReply) {
                return {
                    message: funnelReply,
                    cta: isElite ? getCTA(stage) : "NONE",
                };
            }
        }
        /* =================================================
        💬 FALLBACK
        ================================================= */
        const fallback = (0, smartFallback_service_1.generateSmartFallback)(message);
        return {
            message: stage === "COLD"
                ? fallback + "\n\n" + pick(coldPrompts)
                : fallback,
            cta: "NONE",
        };
    }
    catch (error) {
        console.error("AI ROUTER ERROR:", error);
        return {
            message: "Sorry, something went wrong.",
            cta: "NONE",
        };
    }
};
exports.routeAIMessage = routeAIMessage;
