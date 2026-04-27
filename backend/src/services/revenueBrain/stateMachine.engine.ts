import { getConversationState } from "../conversationState.service";
import { getLeadStateDirective } from "../salesAgent/leadState.service";
import { resolveDeterministicRevenueState } from "./stateMachine.rules";
import type {
  RevenueBrainContext,
  RevenueBrainIntentResult,
  RevenueBrainStateResult,
} from "./types";

export const resolveRevenueBrainState = async ({
  context,
  intent,
}: {
  context: RevenueBrainContext;
  intent: RevenueBrainIntentResult;
}): Promise<RevenueBrainStateResult> => {
  const conversationState = await getConversationState(context.leadId).catch(
    () => null
  );
  const resolved = resolveDeterministicRevenueState({
    currentState:
      context.crmIntelligence.stateGraph.commercial.state ||
      context.salesContext.leadState.state ||
      context.leadMemory.revenueState,
    temperature: context.salesContext.profile.temperature || intent.temperature,
    intent: intent.intent,
    userSignal: intent.userSignal,
    isHumanActive: context.leadMemory.isHumanActive,
    conversationStateName: conversationState?.state || null,
    lifecycleStage: context.crmIntelligence.lifecycle.stage,
    bookingState: context.crmIntelligence.stateGraph.booking.state,
    commercialState: context.crmIntelligence.stateGraph.commercial.state,
    conversationMode: context.crmIntelligence.stateGraph.conversation.mode,
  });

  return {
    currentState: resolved.currentState,
    nextState: resolved.nextState,
    allowedTransitions: resolved.allowedTransitions,
    transitionReason: resolved.transitionReason,
    stage: context.salesContext.profile.stage || intent.stage,
    aiStage: context.salesContext.profile.temperature || intent.temperature,
    directive: getLeadStateDirective(resolved.nextState),
    conversationStateName: conversationState?.state || null,
    shouldReply: resolved.shouldReply,
  };
};
