import { estimateSalesIntentConfidence } from "../salesAgent/output.service";
import type { RevenueBrainContext, RevenueBrainIntentResult } from "./types";

export const resolveRevenueBrainIntent = (
  context: RevenueBrainContext
): RevenueBrainIntentResult => ({
  intent: context.salesContext.profile.intent,
  confidence: estimateSalesIntentConfidence(
    context.inputMessage,
    context.salesContext.profile.intent
  ),
  decisionIntent: context.salesContext.profile.intentCategory,
  objection: context.salesContext.profile.objection.type,
  temperature: context.salesContext.profile.temperature,
  stage: context.salesContext.profile.stage,
  userSignal: context.salesContext.profile.userSignal,
});
