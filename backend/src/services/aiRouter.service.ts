import { generateIntentReply, IntentResponse } from "./aiIntentEngine.service";
import { handleAIBookingIntent } from "./aiBookingEngine.service";
import {
  getConversationState,
  clearConversationState,
} from "./conversationState.service";
import { generateAIFunnelReply } from "./aiFunnel.service";
import { isHumanActive } from "./humanTakeoverManager.service";

import { hasFeature } from "../config/plan.config";

import { generateRAGReply } from "./rag.service";
import { generateSmartFallback } from "./smartFallback.service";
import prisma from "../config/prisma";

/* ================================================= */
interface RouterInput {
  businessId: string;
  leadId: string;
  message: string;
  plan: any;
}

/* ================================================= */
/* 🔥 SMART STAGE ENGINE (FIXED) */
const getStageFromHistory = async (leadId: string, message: string) => {
  const messages = await prisma.message.findMany({
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

  if (count <= 3 && interestScore === 0) return "COLD";
  if (count <= 7 || interestScore === 1) return "WARM";
  if (interestScore >= 2 || count > 7) return "HOT";

  return "COLD";
};

/* 🔥 CTA CONTROL */
const getCTA = (stage: string) => {
  if (stage === "HOT") return "BOOK_NOW";
  return "NONE";
};

/* 🔹 GREETING DETECT */
const isGreeting = (msg: string) =>
  ["hi", "hello", "hey", "hii", "yo"].includes(msg);

/* 🔹 SAFE WRAPPER */
const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

/* 🔥 HUMAN-LIKE RANDOM PROMPTS */
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

const pick = (arr: string[]) =>
  arr[Math.floor(Math.random() * arr.length)];

/* ================================================= */
export const routeAIMessage = async ({
  businessId,
  leadId,
  message,
  plan,
}: RouterInput): Promise<{ message: string; cta?: string } | null> => {
  try {
    const lowerMessage = message.toLowerCase().trim();

    /* ================= HUMAN ================= */
    if (await isHumanActive(leadId)) return null;

    /* ================= STAGE ================= */
    const stage = await getStageFromHistory(leadId, message);

    /* ================= GREETING ================= */
    if (isGreeting(lowerMessage)) {
      await clearConversationState(leadId);

      return {
        message: "Hey 👋 how can I help you today?",
        cta: "NONE",
      };
    }

    /* ================= INTENT ================= */
    const intent = await safe<IntentResponse | null>(
      () =>
        generateIntentReply({
          businessId,
          leadId,
          message,
        }),
      null
    );

    /* ================= BOOKING (ONLY HOT) ================= */
    const isBookingIntent = intent?.intent === "BOOKING";

    if (isBookingIntent && stage === "HOT") {
      const bookingResult = await safe(
        () => handleAIBookingIntent(businessId, leadId, message),
        { handled: false, message: "" }
      );

      if (bookingResult?.handled) {
        return { message: bookingResult.message, cta: "NONE" };
      }
    }

    /* =================================================
    🧠 RAG (PRIMARY)
    ================================================= */
    const ragResult = await safe(
      () => generateRAGReply(businessId, message, leadId),
      { found: false, reply: null, context: "" }
    );

    if (ragResult?.found && ragResult?.reply) {
      let base = ragResult.reply;

      /* ❄️ COLD */
      if (stage === "COLD") {
        return {
          message: base + "\n\n" + pick(coldPrompts),
          cta: "NONE",
        };
      }

      /* 🌤 WARM */
      if (stage === "WARM") {
        return {
          message: base + "\n\n" + pick(warmPrompts),
          cta: "NONE",
        };
      }

      /* 🔥 HOT */
      if (stage === "HOT") {
        return {
          message:
            base +
            "\n\nMakes sense for you 👍 want me to set up a quick call?",
          cta: getCTA(stage),
        };
      }
    }

    /* =================================================
    🧲 FUNNEL (WARM + HOT ONLY)
    ================================================= */
    if (stage !== "COLD") {
      const funnelReply = await safe(
        () =>
          generateAIFunnelReply({
            businessId,
            leadId,
            message,
          }),
        null
      );

      if (funnelReply) {
        /* 🌤 WARM → NO CTA */
        if (stage === "WARM") {
          return {
            message: funnelReply,
            cta: "NONE",
          };
        }

        /* 🔥 HOT → CTA ALLOWED */
        return {
          message: funnelReply,
          cta: getCTA(stage),
        };
      }
    }

    /* =================================================
    💬 FALLBACK
    ================================================= */
    const fallback = generateSmartFallback(message);

    return {
      message:
        stage === "COLD"
          ? fallback + "\n\n" + pick(coldPrompts)
          : fallback,
      cta: "NONE",
    };
  } catch (error) {
    console.error("AI ROUTER ERROR:", error);

    return {
      message: "Sorry, something went wrong.",
      cta: "NONE",
    };
  }
};