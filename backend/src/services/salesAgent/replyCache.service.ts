import {
  SALES_DECISION_TTL_SECONDS,
  SALES_LAST_REPLY_TTL_SECONDS,
  SALES_PROGRESSION_TTL_SECONDS,
  buildDecisionRedisKey,
  buildLastReplyRedisKey,
  buildProgressionRedisKey,
  deleteRedisKeys,
  writeRedisJsonIfChanged,
} from "../redisState.service";
import { normalizeSalesReplyFingerprint } from "./progression.service";
import type {
  SalesAgentReply,
  SalesDecisionAction,
  SalesProgressionState,
} from "./types";

type CacheSalesReplyStateInput = {
  leadId: string;
  decision: SalesDecisionAction;
  progression: SalesProgressionState;
  reply: SalesAgentReply;
};

export const cacheSalesReplyState = async ({
  leadId,
  decision,
  progression,
  reply,
}: CacheSalesReplyStateInput) => {
  const replyFingerprint = normalizeSalesReplyFingerprint(reply.message);
  const repeatedReplyCount =
    replyFingerprint && replyFingerprint === progression.lastReplyNormalized
      ? progression.repeatedReplyCount + 1
      : 0;

  await Promise.allSettled([
    writeRedisJsonIfChanged(
      buildDecisionRedisKey(leadId),
      {
        action: decision.action,
        priority: decision.priority,
        strategy: decision.strategy,
        leadState: decision.leadState,
        intent: decision.intent,
        emotion: decision.emotion,
        cta: decision.cta,
        tone: decision.tone,
        structure: decision.structure,
        ctaStyle: decision.ctaStyle,
        messageLength: decision.messageLength,
        topPatterns: decision.topPatterns,
      },
      SALES_DECISION_TTL_SECONDS
    ),
    writeRedisJsonIfChanged(
      buildLastReplyRedisKey(leadId),
      {
        message: reply.message,
        normalized: replyFingerprint || null,
        cta: reply.cta,
        action: decision.action,
      },
      SALES_LAST_REPLY_TTL_SECONDS
    ),
    writeRedisJsonIfChanged(
      buildProgressionRedisKey(leadId),
      {
        currentAction: decision.action,
        actionPriority: decision.priority,
        funnelPosition: progression.funnelPosition,
        pricingStep: progression.pricingStep,
        lastAction: decision.action,
        lastReplyNormalized:
          replyFingerprint || progression.lastReplyNormalized || null,
        loopDetected: progression.loopDetected,
        repeatedIntentCount: progression.repeatedIntentCount,
        repeatedReplyCount,
        userSignal: progression.userSignal,
        shouldAdvance: progression.shouldAdvance,
      },
      SALES_PROGRESSION_TTL_SECONDS
    ),
  ]);
};

export const clearSalesReplyState = async (leadId: string) =>
  deleteRedisKeys([
    buildDecisionRedisKey(leadId),
    buildLastReplyRedisKey(leadId),
    buildProgressionRedisKey(leadId),
  ]);
