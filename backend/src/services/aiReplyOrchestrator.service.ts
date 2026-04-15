import { bookingPriorityRouter } from "./bookingPriorityRouter.service";
import { getConversationState } from "./conversationState.service";
import { isHumanActive } from "./humanTakeoverManager.service";
import { routeAIMessage } from "./aiRouter.service";
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
  source: AIReplySource;
  latencyMs: number;
  traceId?: string;
  meta: {
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
};

type ReplyCandidate = {
  message: string;
  cta?: string | null;
};

const TOTAL_REPLY_BUDGET_MS = 1900;
const BOOKING_STAGE_TIMEOUT_MS = 550;
const AUTOMATION_STAGE_TIMEOUT_MS = 450;
const MIN_STAGE_TIMEOUT_MS = 200;
const BUDGET_RESERVE_MS = 125;
const BOOKING_ASSIST_SUFFIX =
  "If you'd like, I can also check available slots for you.";

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

  const candidate = reply as { message?: unknown; cta?: unknown };
  const message = String(candidate.message || "").trim();

  if (!message) {
    return null;
  }

  return {
    message,
    cta: typeof candidate.cta === "string" ? candidate.cta : null,
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
  if (!shouldAttach) {
    return reply;
  }

  if (/available slot|check available|schedule|appointment/i.test(reply.message)) {
    return reply;
  }

  return {
    ...reply,
    message: `${reply.message}\n\n${BOOKING_ASSIST_SUFFIX}`,
  };
};

const buildSystemReply = (shouldAttachBookingAssist: boolean): ReplyCandidate => {
  const message = shouldAttachBookingAssist
    ? `I got your message. Tell me if you want pricing, details, or booking help.\n\n${BOOKING_ASSIST_SUFFIX}`
    : "I got your message. Tell me if you want pricing, details, booking, or a quick explanation.";

  return {
    message,
    cta: "NONE",
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
    source,
    latencyMs,
    traceId,
    meta: {
      source,
      latencyMs,
      traceId,
    },
  };
};

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
}: RouterInput): Promise<AIReplyDecision | null> => {
  const startedAt = Date.now();
  const normalizedMessage = String(message || "").trim();

  if (!normalizedMessage) {
    return finalizeReply("SYSTEM", buildSystemReply(false), startedAt, traceId);
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

  const aiStage = await runStage(
    "ai_router",
    startedAt,
    traceId,
    getRemainingBudget(startedAt),
    () =>
      routeAIMessage({
        businessId,
        leadId,
        message: normalizedMessage,
        plan,
      }),
    null
  );

  const aiReply = normalizeReplyCandidate(aiStage.value);
  const aiHit = Boolean(aiReply && !isSystemNoise(aiReply));

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
    buildSystemReply(
      shouldOfferBookingAssist(curiosityIntent, bookingActive, "SYSTEM")
    ),
    startedAt,
    traceId
  );
};
