import { generateIntentReply } from "./aiIntentEngine.service";
import { handleAIBookingIntent } from "./aiBookingEngine.service";
import { clearConversationState } from "./conversationState.service";
import { generateAIFunnelReply } from "./aiFunnel.service";
import { generateRAGReply } from "./rag.service";
import { generateSmartFallback } from "./smartFallback.service";
import prisma from "../config/prisma";
import logger from "../utils/logger";

interface RouterInput {
  businessId: string;
  leadId: string;
  message: string;
  plan: any;
}

type RouterReply = {
  message: string;
  cta?: string;
};

type RAGResult = {
  found: boolean;
  reply: string | null;
  context: string;
};

const ROUTER_REPLY_BUDGET_MS = 1800;
const ROUTER_REPLY_RESERVE_MS = 150;
const RAG_TIMEOUT_MS = 900;
const FUNNEL_TIMEOUT_MS = 650;
const MIN_TIMEOUT_MS = 150;

const getStageFromHistory = async (leadId: string, message: string) => {
  const count = await prisma.message.count({
    where: { leadId },
  });
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

const getCTA = (stage: string) => {
  if (stage === "HOT") return "BOOK_NOW";
  return "NONE";
};

const isGreeting = (msg: string) =>
  ["hi", "hello", "hey", "hii", "yo"].includes(msg);

const isLikelyBookingIntent = (msg: string) =>
  /book|booking|appointment|schedule|slot|call|meeting|consult|demo/.test(msg);

const shouldSyncIntentFast = (msg: string) =>
  /hi|hello|hey|price|cost|fees|pricing|book|schedule|appointment|call|buy|purchase|pay/.test(
    msg
  );

const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

const withTimeout = async <T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> => {
  if (timeoutMs < MIN_TIMEOUT_MS) {
    return fallback;
  }

  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      fn(),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const getRemainingBudget = (startedAt: number) =>
  Math.max(
    0,
    ROUTER_REPLY_BUDGET_MS - (Date.now() - startedAt) - ROUTER_REPLY_RESERVE_MS
  );

const runWithinBudget = async <T>(
  startedAt: number,
  maxMs: number,
  fn: () => Promise<T>,
  fallback: T
) => withTimeout(fn, Math.min(maxMs, getRemainingBudget(startedAt)), fallback);

const coldPrompts = [
  "Got it. Can you tell me a bit more about your use case?",
  "Interesting. What exactly are you trying to achieve?",
  "Okay, help me understand your requirement a bit better.",
];

const warmPrompts = [
  "I can explain how this would work for you.",
  "Want me to break this down for your use case?",
  "I can show you how people usually use this.",
];

const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

const buildFallbackReply = (
  message: string,
  stage: string,
  isElite: boolean
): RouterReply => {
  const fallback = generateSmartFallback(message).trim();

  if (stage === "COLD") {
    return {
      message: `${fallback}\n\n${pick(coldPrompts)}`,
      cta: "NONE",
    };
  }

  if (stage === "WARM") {
    return {
      message: `${fallback}\n\n${pick(warmPrompts)}`,
      cta: "NONE",
    };
  }

  return {
    message: fallback,
    cta: isElite ? getCTA(stage) : "NONE",
  };
};

const buildRAGReply = (
  base: string,
  stage: string,
  isBasic: boolean,
  isElite: boolean
): RouterReply => {
  if (isBasic || stage === "COLD") {
    return {
      message: `${base}\n\n${pick(coldPrompts)}`,
      cta: "NONE",
    };
  }

  if (stage === "WARM") {
    return {
      message: `${base}\n\n${pick(warmPrompts)}`,
      cta: "NONE",
    };
  }

  return {
    message: `${base}\n\nMakes sense for you, want me to set up a quick call?`,
    cta: isElite ? "BOOK_NOW" : "NONE",
  };
};

const syncFastIntentSignals = (
  businessId: string,
  leadId: string,
  message: string,
  lowerMessage: string
) => {
  if (!shouldSyncIntentFast(lowerMessage)) {
    return;
  }

  void generateIntentReply({
    businessId,
    leadId,
    message,
  }).catch(() => {});
};

export const routeAIMessage = async ({
  businessId,
  leadId,
  message,
  plan,
}: RouterInput): Promise<RouterReply | null> => {
  const startedAt = Date.now();
  const normalizedMessage = String(message || "").trim();

  if (!normalizedMessage) {
    return {
      message: "I got your message. How can I help you?",
      cta: "NONE",
    };
  }

  try {
    const lowerMessage = normalizedMessage.toLowerCase();
    const normalizedPlan = String(plan?.type || plan?.name || "").toUpperCase();
    const isBasic = normalizedPlan.includes("BASIC");
    const isElite = normalizedPlan.includes("ELITE");

    const stage = await safe(
      () => getStageFromHistory(leadId, normalizedMessage),
      "COLD"
    );

    if (isGreeting(lowerMessage)) {
      void clearConversationState(leadId).catch(() => {});

      return {
        message: "Hey, how can I help you today?",
        cta: "NONE",
      };
    }

    syncFastIntentSignals(businessId, leadId, normalizedMessage, lowerMessage);

    if (isLikelyBookingIntent(lowerMessage) && isElite && stage === "HOT") {
      const bookingResult = await safe(
        () => handleAIBookingIntent(businessId, leadId, normalizedMessage),
        { handled: false, message: "" }
      );

      if (bookingResult?.handled && bookingResult.message) {
        return {
          message: bookingResult.message,
          cta: "NONE",
        };
      }
    }

    const ragResult = await safe<RAGResult>(
      () =>
        runWithinBudget(
          startedAt,
          RAG_TIMEOUT_MS,
          () => generateRAGReply(businessId, normalizedMessage, leadId),
          { found: false, reply: null, context: "" }
        ),
      { found: false, reply: null, context: "" }
    );

    if (ragResult.found && ragResult.reply) {
      return buildRAGReply(ragResult.reply, stage, isBasic, isElite);
    }

    if (!isBasic && stage !== "COLD") {
      const funnelReply = await safe(
        () =>
          runWithinBudget(
            startedAt,
            FUNNEL_TIMEOUT_MS,
            () =>
              generateAIFunnelReply({
                businessId,
                leadId,
                message: normalizedMessage,
              }),
            null
          ),
        null
      );

      if (funnelReply) {
        return {
          message: funnelReply,
          cta: isElite ? getCTA(stage) : "NONE",
        };
      }
    }

    return buildFallbackReply(normalizedMessage, stage, isElite);
  } catch (error) {
    logger.error(
      {
        businessId,
        leadId,
        error,
      },
      "AI router failed"
    );

    return buildFallbackReply(normalizedMessage, "COLD", false);
  }
};
