import { bookingPriorityRouter } from "./bookingPriorityRouter.service";
import { getConversationState } from "./conversationState.service";
import { isHumanActive } from "./humanTakeoverManager.service";
import { routeAIMessage } from "./aiRouter.service";
import { buildSalesAgentRecoveryReply } from "./salesAgent/reply.service";
import { runAutomationEngine } from "./automationEngine.service";
import logger from "../utils/logger";

export type AIReplySource =
  | "BOOKING"
  | "AUTOMATION"
  | "AI_ROUTER"
  | "SYSTEM";

export type AIReplyDecision = {
  message: string;
  cta?: string;
  angle?: string | null;
  reason?: string | null;
  source: AIReplySource;
  latencyMs: number;
  traceId?: string;
  meta: Record<string, unknown> & {
    source: AIReplySource;
    latencyMs: number;
    traceId?: string;
  };
};

type RouterInput = {
  businessId: string;
  leadId: string;
  message: string;
  plan?: unknown;
  traceId?: string;
  beforeAIReply?: () => Promise<AIStageReservation | void>;
};

type AIStageReservation = {
  finalize?: () => Promise<void>;
  release?: () => Promise<void>;
};

type ReplyCandidate = {
  message: string;
  cta?: string | null;
  angle?: string | null;
  reason?: string | null;
  meta?: Record<string, unknown>;
};

const TOTAL_REPLY_BUDGET_MS = 1900;
const BOOKING_STAGE_TIMEOUT_MS = 550;
const AUTOMATION_STAGE_TIMEOUT_MS = 450;
const MIN_STAGE_TIMEOUT_MS = 200;
const BUDGET_RESERVE_MS = 125;

const withTimeout = async <T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  fallback: T
) => {
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
    TOTAL_REPLY_BUDGET_MS - (Date.now() - startedAt) - BUDGET_RESERVE_MS
  );

const normalizeReplyCandidate = (reply: unknown): ReplyCandidate | null => {
  if (typeof reply === "string") {
    const message = reply.trim();
    return message ? { message } : null;
  }

  if (!reply || typeof reply !== "object") {
    return null;
  }

  const candidate = reply as {
    message?: unknown;
    cta?: unknown;
    angle?: unknown;
    reason?: unknown;
    meta?: unknown;
  };
  const message = String(candidate.message || "").trim();

  if (!message) {
    return null;
  }

  return {
    message,
    cta: typeof candidate.cta === "string" ? candidate.cta : null,
    angle: typeof candidate.angle === "string" ? candidate.angle : null,
    reason: typeof candidate.reason === "string" ? candidate.reason : null,
    meta:
      candidate.meta && typeof candidate.meta === "object"
        ? (candidate.meta as Record<string, unknown>)
        : {},
  };
};

const isSystemNoise = (reply: ReplyCandidate | null) => {
  if (!reply) {
    return false;
  }

  return /conversation limit reached|our team will assist|please wait|something went wrong/i.test(
    reply.message
  );
};

const isBookingIntent = (message: string) =>
  /book|booking|appointment|schedule|slot|call|meeting|consult|demo|aaj|kal|baje|time/.test(
    message
  );

const isCuriosityIntent = (message: string) =>
  /price|cost|pricing|details|detail|info|information|service|plan/.test(
    message
  );

const shouldOfferBookingAssist = (
  curiosityIntent: boolean,
  bookingActive: boolean,
  source: AIReplySource
) => curiosityIntent && !bookingActive && source !== "BOOKING";

const attachBookingAssist = (
  reply: ReplyCandidate,
  shouldAttach: boolean
): ReplyCandidate => {
  if (!shouldAttach || (reply.cta && reply.cta !== "NONE")) {
    return reply;
  }

  return {
    message: "I can check the fastest available slot for you.\nWant the booking link?",
    cta: "BOOK_CALL",
    angle: reply.angle || "urgency",
    reason: reply.reason || "booking_assist",
    meta: reply.meta || {},
  };
};

const buildSystemReply = (message: string): ReplyCandidate => {
  const recovery = buildSalesAgentRecoveryReply(message);

  return {
    message: recovery.message,
    cta: recovery.cta,
    angle: recovery.angle,
    reason: recovery.reason || null,
  };
};

const finalizeReply = (
  source: AIReplySource,
  reply: ReplyCandidate,
  startedAt: number,
  traceId?: string
): AIReplyDecision => {
  const latencyMs = Date.now() - startedAt;
  const cta = reply.cta || "NONE";

  return {
    message: reply.message,
    cta,
    angle: reply.angle || null,
    reason: reply.reason || null,
    source,
    latencyMs,
    traceId,
    meta: {
      ...(reply.meta || {}),
      source,
      latencyMs,
      traceId,
      cta,
      angle: reply.angle || null,
      reason: reply.reason || null,
    },
  };
};

const isAiGeneratedReply = (reply: ReplyCandidate | null) =>
  reply?.meta?.aiGenerated !== false;

const runStage = async <T>(
  stage: string,
  startedAt: number,
  traceId: string | undefined,
  maxMs: number,
  fn: () => Promise<T>,
  fallback: T
) => {
  const remainingBudgetMs = getRemainingBudget(startedAt);
  const timeoutMs = Math.min(maxMs, remainingBudgetMs);
  const stageStartedAt = Date.now();

  if (timeoutMs < MIN_STAGE_TIMEOUT_MS) {
    logger.warn(
      {
        stage,
        traceId,
        remainingBudgetMs,
      },
      "AI reply stage skipped due to low remaining budget"
    );

    return {
      value: fallback,
      timedOut: true,
      elapsedMs: Date.now() - stageStartedAt,
      skipped: true,
    };
  }

  let timedOut = false;
  const timeoutFallback = Symbol(stage);

  const value = await withTimeout(
    async () => fn(),
    timeoutMs,
    timeoutFallback as T
  );

  if (value === (timeoutFallback as T)) {
    timedOut = true;
  }

  return {
    value: timedOut ? fallback : value,
    timedOut,
    elapsedMs: Date.now() - stageStartedAt,
    skipped: false,
  };
};

const logStageResult = ({
  stage,
  source,
  traceId,
  leadId,
  elapsedMs,
  timedOut,
  hit,
}: {
  stage: string;
  source: AIReplySource | "NONE";
  traceId?: string;
  leadId: string;
  elapsedMs: number;
  timedOut: boolean;
  hit: boolean;
}) => {
  logger.info(
    {
      stage,
      source,
      traceId,
      leadId,
      elapsedMs,
      timedOut,
      hit,
    },
    "AI reply stage completed"
  );
};

export const resolveAIReply = async ({
  businessId,
  leadId,
  message,
  plan,
  traceId,
  beforeAIReply,
}: RouterInput): Promise<AIReplyDecision | null> => {
  const startedAt = Date.now();
  const normalizedMessage = String(message || "").trim();

  if (!normalizedMessage) {
    return finalizeReply(
      "SYSTEM",
      buildSystemReply(normalizedMessage),
      startedAt,
      traceId
    );
  }

  if (await isHumanActive(leadId)) {
    logger.info(
      {
        traceId,
        businessId,
        leadId,
      },
      "AI reply skipped because human takeover is active"
    );
    return null;
  }

  const lowerMessage = normalizedMessage.toLowerCase();
  const curiosityIntent = isCuriosityIntent(lowerMessage);
  const state = await getConversationState(leadId);
  const bookingActive =
    state?.state === "BOOKING_SELECTION" ||
    state?.state === "BOOKING_CONFIRMATION" ||
    state?.state === "RESCHEDULE_FLOW";

  if (bookingActive || isBookingIntent(lowerMessage)) {
    const bookingStage = await runStage(
      "booking",
      startedAt,
      traceId,
      BOOKING_STAGE_TIMEOUT_MS,
      () =>
        bookingPriorityRouter({
          businessId,
          leadId,
          message: normalizedMessage,
          plan,
        }),
      null
    );

    const bookingReply = normalizeReplyCandidate(bookingStage.value);
    const bookingHit = Boolean(bookingReply && !isSystemNoise(bookingReply));

    logStageResult({
      stage: "booking",
      source: bookingHit ? "BOOKING" : "NONE",
      traceId,
      leadId,
      elapsedMs: bookingStage.elapsedMs,
      timedOut: bookingStage.timedOut,
      hit: bookingHit,
    });

    if (bookingHit && bookingReply) {
      return finalizeReply("BOOKING", bookingReply, startedAt, traceId);
    }
  }

  const automationStage = await runStage(
    "automation",
    startedAt,
    traceId,
    AUTOMATION_STAGE_TIMEOUT_MS,
    () =>
      runAutomationEngine({
        businessId,
        leadId,
        message: normalizedMessage,
      }),
    null
  );

  const automationReply = normalizeReplyCandidate(automationStage.value);
  const automationHit = Boolean(
    automationReply && !isSystemNoise(automationReply)
  );

  logStageResult({
    stage: "automation",
    source: automationHit ? "AUTOMATION" : "NONE",
    traceId,
    leadId,
    elapsedMs: automationStage.elapsedMs,
    timedOut: automationStage.timedOut,
    hit: automationHit,
  });

  if (automationHit && automationReply) {
    return finalizeReply(
      "AUTOMATION",
      attachBookingAssist(
        automationReply,
        shouldOfferBookingAssist(curiosityIntent, bookingActive, "AUTOMATION")
      ),
      startedAt,
      traceId
    );
  }

  let aiReservation: AIStageReservation | null = null;
  let aiStage: {
    value: unknown;
    timedOut: boolean;
    elapsedMs: number;
    skipped: boolean;
  };

  try {
    aiStage = await runStage(
      "ai_router",
      startedAt,
      traceId,
      getRemainingBudget(startedAt),
      async () => {
        aiReservation = (await beforeAIReply?.()) || null;

        return routeAIMessage({
          businessId,
          leadId,
          message: normalizedMessage,
          plan,
        });
      },
      null
    );
  } catch (error) {
    await aiReservation?.release?.().catch((releaseError) => {
      logger.warn(
        {
          traceId,
          businessId,
          leadId,
          error: releaseError,
        },
        "AI usage release skipped after AI router preflight failure"
      );
    });

    logger.warn(
      {
        traceId,
        businessId,
        leadId,
        error,
      },
      "AI router skipped before execution"
    );

    return finalizeReply(
      "SYSTEM",
      buildSystemReply(normalizedMessage),
      startedAt,
      traceId
    );
  }

  const aiReply = normalizeReplyCandidate(aiStage.value);
  const aiGenerated = isAiGeneratedReply(aiReply);
  const aiHit = Boolean(aiReply && !isSystemNoise(aiReply) && aiGenerated);

  logStageResult({
    stage: "ai_router",
    source: aiHit ? "AI_ROUTER" : "NONE",
    traceId,
    leadId,
    elapsedMs: aiStage.elapsedMs,
    timedOut: aiStage.timedOut,
    hit: aiHit,
  });

  if (aiHit && aiReply) {
    await aiReservation?.finalize?.().catch((error) => {
      logger.warn(
        {
          traceId,
          businessId,
          leadId,
          error,
        },
        "AI usage finalize skipped after successful AI reply"
      );
    });

    return finalizeReply(
      "AI_ROUTER",
      attachBookingAssist(
        aiReply,
        shouldOfferBookingAssist(curiosityIntent, bookingActive, "AI_ROUTER")
      ),
      startedAt,
      traceId
    );
  }

  if (aiReservation?.release) {
    await aiReservation.release().catch((error) => {
      logger.warn(
        {
          traceId,
          businessId,
          leadId,
          error,
        },
        "AI usage release skipped after non-AI fallback"
      );
    });
  }

  if (aiReply && !aiGenerated) {
    return finalizeReply("SYSTEM", aiReply, startedAt, traceId);
  }

  logger.warn(
    {
      traceId,
      businessId,
      leadId,
      latencyMs: Date.now() - startedAt,
    },
    "AI reply pipeline fell back to system recovery reply"
  );

  return finalizeReply(
    "SYSTEM",
    buildSystemReply(normalizedMessage),
    startedAt,
    traceId
  );
};
