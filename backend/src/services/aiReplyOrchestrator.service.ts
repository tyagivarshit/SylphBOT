import { runRevenueBrainOrchestrator } from "./revenueBrain/orchestrator.service";
import { buildSalesAgentRecoveryReply } from "./salesAgent/reply.service";
import logger from "../utils/logger";

export type AIReplySource =
  | "BOOKING"
  | "AUTOMATION"
  | "SALES"
  | "ESCALATE"
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
  source?: string | null;
  beforeAIReply?: () => Promise<AIStageReservation | void>;
};

type AIStageReservation = {
  finalize?: () => Promise<void>;
  release?: () => Promise<void>;
};

const normalizeSource = (value?: string | null): AIReplySource => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();

  if (normalized === "BOOKING") return "BOOKING";
  if (normalized === "AUTOMATION") return "AUTOMATION";
  if (normalized === "ESCALATE") return "ESCALATE";
  if (normalized === "SYSTEM") return "SYSTEM";
  return "SALES";
};

export const resolveAIReply = async ({
  businessId,
  leadId,
  message,
  plan,
  traceId,
  source,
  beforeAIReply,
}: RouterInput): Promise<AIReplyDecision | null> => {
  try {
    const reply = await runRevenueBrainOrchestrator({
      businessId,
      leadId,
      message,
      plan,
      traceId,
      source: source || "LEGACY_COMPAT",
      beforeAIReply,
    });

    if (!reply) {
      return null;
    }

    const normalizedSource = normalizeSource(reply.source);
    const latencyMs = Number(reply.latencyMs || 0);

    return {
      message: reply.message,
      cta: reply.cta,
      angle: reply.angle || null,
      reason: reply.reason || null,
      source: normalizedSource,
      latencyMs,
      traceId: reply.traceId || traceId,
      meta: {
        ...(reply.meta || {}),
        source: normalizedSource,
        latencyMs,
        traceId: reply.traceId || traceId,
      },
    };
  } catch (error) {
    logger.error(
      {
        businessId,
        leadId,
        traceId,
        error,
      },
      "AI reply orchestrator failed"
    );

    const recovery = buildSalesAgentRecoveryReply(message);

    return {
      ...recovery,
      source: "SYSTEM",
      latencyMs: 0,
      traceId,
      meta: {
        ...(recovery.meta || {}),
        source: "SYSTEM",
        latencyMs: 0,
        traceId,
      },
    };
  }
};
