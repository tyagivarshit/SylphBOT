import type { LeadRevenueState } from "../salesAgent/types";

type DeterministicStateInput = {
  currentState?: LeadRevenueState | string | null;
  temperature?: string | null;
  intent?: string | null;
  userSignal?: string | null;
  isHumanActive?: boolean;
  conversationStateName?: string | null;
  lifecycleStage?: string | null;
  bookingState?: string | null;
  commercialState?: string | null;
  conversationMode?: string | null;
};

export type DeterministicStateOutput = {
  currentState: LeadRevenueState;
  nextState: LeadRevenueState;
  allowedTransitions: LeadRevenueState[];
  transitionReason: string;
  shouldReply: boolean;
};

const ALLOWED_TRANSITIONS: Record<LeadRevenueState, LeadRevenueState[]> = {
  COLD: ["COLD", "WARM"],
  WARM: ["COLD", "WARM", "HOT"],
  HOT: ["WARM", "HOT", "CONVERTED"],
  CONVERTED: ["CONVERTED"],
};

const STATE_ORDER: LeadRevenueState[] = [
  "COLD",
  "WARM",
  "HOT",
  "CONVERTED",
];

const BOOKING_FLOW_STATES = new Set([
  "BOOKING_SELECTION",
  "BOOKING_CONFIRMATION",
  "RESCHEDULE_FLOW",
]);

const normalizeState = (value?: string | null): LeadRevenueState => {
  const normalized = String(value || "").trim().toUpperCase();

  if (normalized === "CONVERTED") return "CONVERTED";
  if (normalized === "HOT") return "HOT";
  if (normalized === "WARM") return "WARM";
  return "COLD";
};

export const getAllowedRevenueTransitions = (state: LeadRevenueState) =>
  ALLOWED_TRANSITIONS[state];

const resolveClosestAllowedTransition = ({
  currentState,
  targetState,
  allowedTransitions,
}: {
  currentState: LeadRevenueState;
  targetState: LeadRevenueState;
  allowedTransitions: LeadRevenueState[];
}) => {
  if (allowedTransitions.includes(targetState)) {
    return targetState;
  }

  const currentIndex = STATE_ORDER.indexOf(currentState);
  const targetIndex = STATE_ORDER.indexOf(targetState);

  if (targetIndex > currentIndex) {
    return (
      [...allowedTransitions]
        .sort(
          (left, right) =>
            STATE_ORDER.indexOf(right) - STATE_ORDER.indexOf(left)
        )
        .find((state) => STATE_ORDER.indexOf(state) <= targetIndex) ||
      currentState
    );
  }

  return (
    [...allowedTransitions]
      .sort(
        (left, right) =>
          STATE_ORDER.indexOf(left) - STATE_ORDER.indexOf(right)
      )
      .find((state) => STATE_ORDER.indexOf(state) >= targetIndex) || currentState
  );
};

const resolveTargetState = (input: DeterministicStateInput): {
  targetState: LeadRevenueState;
  reason: string;
} => {
  const intent = String(input.intent || "").trim().toUpperCase();
  const temperature = String(input.temperature || "").trim().toUpperCase();
  const userSignal = String(input.userSignal || "").trim().toLowerCase();
  const conversationStateName = String(input.conversationStateName || "")
    .trim()
    .toUpperCase();
  const lifecycleStage = String(input.lifecycleStage || "").trim().toUpperCase();
  const bookingState = String(input.bookingState || "").trim().toUpperCase();
  const commercialState = String(input.commercialState || "")
    .trim()
    .toUpperCase();
  const conversationMode = String(input.conversationMode || "")
    .trim()
    .toUpperCase();

  if (commercialState === "CONVERTED" || lifecycleStage === "CONVERTED") {
    return {
      targetState: "CONVERTED",
      reason: "crm_state:converted",
    };
  }

  if (bookingState === "SCHEDULED" || lifecycleStage === "BOOKED") {
    return {
      targetState: "HOT",
      reason: "crm_state:booked",
    };
  }

  if (conversationMode === "BOOKING_ACTIVE") {
    return {
      targetState: "HOT",
      reason: "crm_conversation:booking_active",
    };
  }

  if (BOOKING_FLOW_STATES.has(conversationStateName)) {
    return {
      targetState: "HOT",
      reason: `conversation_state:${conversationStateName.toLowerCase()}`,
    };
  }

  if (intent === "PURCHASE") {
    return {
      targetState: "HOT",
      reason: "intent:purchase",
    };
  }

  if (intent === "BOOKING") {
    return {
      targetState: "HOT",
      reason: "intent:booking",
    };
  }

  if (temperature === "HOT" || userSignal === "yes") {
    return {
      targetState: "HOT",
      reason: temperature === "HOT" ? "temperature:hot" : "user_signal:yes",
    };
  }

  if (
    temperature === "WARM" ||
    intent === "PRICING" ||
    intent === "QUALIFICATION" ||
    intent === "OBJECTION" ||
    userSignal === "question"
  ) {
    return {
      targetState: "WARM",
      reason:
        temperature === "WARM"
          ? "temperature:warm"
          : userSignal === "question"
            ? "user_signal:question"
            : `intent:${intent.toLowerCase()}`,
    };
  }

  if (userSignal === "no") {
    return {
      targetState: "COLD",
      reason: "user_signal:no",
    };
  }

  return {
    targetState: "COLD",
    reason: "default:cold",
  };
};

export const resolveDeterministicRevenueState = (
  input: DeterministicStateInput
): DeterministicStateOutput => {
  const currentState = normalizeState(input.currentState || input.commercialState);
  const allowedTransitions = getAllowedRevenueTransitions(currentState);

  if (input.isHumanActive) {
    return {
      currentState,
      nextState: currentState,
      allowedTransitions,
      transitionReason: "human_takeover_active",
      shouldReply: false,
    };
  }

  if (
    currentState === "CONVERTED" ||
    String(input.commercialState || "").trim().toUpperCase() === "CONVERTED" ||
    String(input.lifecycleStage || "").trim().toUpperCase() === "CONVERTED"
  ) {
    return {
      currentState,
      nextState: "CONVERTED",
      allowedTransitions,
      transitionReason: "terminal:converted",
      shouldReply: true,
    };
  }

  const { targetState, reason } = resolveTargetState(input);
  const nextState = resolveClosestAllowedTransition({
    currentState,
    targetState,
    allowedTransitions,
  });

  return {
    currentState,
    nextState,
    allowedTransitions,
    transitionReason:
      nextState === targetState
        ? reason
        : `${reason}:stepped_from_${currentState.toLowerCase()}_to_${nextState.toLowerCase()}`,
    shouldReply: true,
  };
};
