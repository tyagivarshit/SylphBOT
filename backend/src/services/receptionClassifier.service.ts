import {
  publishReceptionEvent,
  type ReceptionEventWriter,
} from "./receptionEvent.service";
import {
  clampNumber,
  coerceOptionalString,
  normalizeToken,
  toRecord,
  type InboundInteractionAuthorityRecord,
  type InboxRouteTarget,
  type ReceptionContextReferences,
  type ReceptionMemoryAuthorityRecord,
} from "./reception.shared";
import { transitionInboundInteraction } from "./inboundLifecycle.service";

export type ReceptionClassification = {
  intentClass: string;
  urgencyClass: string;
  sentimentClass: string;
  spamScore: number;
  routeHint: InboxRouteTarget;
  complaintSeverity: number;
  reasons: string[];
};

export type ReceptionClassifierContext = {
  interaction: InboundInteractionAuthorityRecord;
  references?: ReceptionContextReferences | null;
  receptionMemory?: ReceptionMemoryAuthorityRecord | null;
};

export type InboundClassificationRepository = {
  applyClassification: (input: {
    interactionId: string;
    classification: ReceptionClassification;
  }) => Promise<InboundInteractionAuthorityRecord>;
};

const SPAM_PATTERNS = [
  /free money/i,
  /guaranteed profit/i,
  /click here/i,
  /work from home/i,
  /bitcoin/i,
  /forex/i,
  /loan approved/i,
];

const BILLING_PATTERNS = [/invoice/i, /billing/i, /refund/i, /charge/i, /payment/i];
const APPOINTMENT_PATTERNS = [
  /book/i,
  /resched/i,
  /schedule/i,
  /appointment/i,
  /slot/i,
  /demo/i,
];
const SUPPORT_PATTERNS = [
  /issue/i,
  /not working/i,
  /problem/i,
  /help/i,
  /support/i,
  /broken/i,
];
const COMPLAINT_PATTERNS = [
  /complaint/i,
  /angry/i,
  /bad service/i,
  /frustrat/i,
  /disappoint/i,
  /terrible/i,
];
const ABUSE_PATTERNS = [/\bidiot\b/i, /\bscam\b/i, /\bfraud\b/i, /\blawsuit\b/i];
const SALES_PATTERNS = [
  /pricing/i,
  /quote/i,
  /plan/i,
  /buy/i,
  /purchase/i,
  /cost/i,
  /package/i,
];
const URGENT_PATTERNS = [/asap/i, /urgent/i, /immediately/i, /right now/i, /today/i];
const POSITIVE_PATTERNS = [/thanks/i, /great/i, /awesome/i, /love/i];
const NEGATIVE_PATTERNS = [/angry/i, /upset/i, /frustrat/i, /hate/i, /bad/i];

const includesPattern = (input: string, patterns: RegExp[]) =>
  patterns.some((pattern) => pattern.test(input));

const detectSpamScore = (input: string) => {
  if (!input) {
    return 0;
  }

  let score = 0;
  const spamMatchCount = SPAM_PATTERNS.reduce(
    (count, pattern) => count + (pattern.test(input) ? 1 : 0),
    0
  );
  const urlMatches = input.match(/https?:\/\//gi) || [];
  const uppercaseRatio =
    input.replace(/[^A-Z]/g, "").length / Math.max(1, input.replace(/\s/g, "").length);
  const tokens = input
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const tokenFrequency = tokens.reduce<Record<string, number>>((state, token) => {
    state[token] = (state[token] || 0) + 1;
    return state;
  }, {});
  const repeatedCount = Object.values(tokenFrequency).some((count) => count >= 3)
    ? 1
    : 0;

  score += Math.min(0.7, spamMatchCount * 0.35);
  score += Math.min(0.2, urlMatches.length * 0.1);
  score += repeatedCount ? 0.1 : 0;
  score += uppercaseRatio > 0.7 ? 0.15 : 0;
  score += tokens.length <= 2 ? 0.05 : 0;

  return clampNumber(score, 0, 1);
};

const resolveIntentClass = ({
  text,
  interactionType,
}: {
  text: string;
  interactionType: string;
}) => {
  if (includesPattern(text, ABUSE_PATTERNS)) {
    return "ABUSE";
  }

  if (detectSpamScore(text) >= 0.85) {
    return "SPAM";
  }

  if (interactionType === "REVIEW" || includesPattern(text, COMPLAINT_PATTERNS)) {
    return "COMPLAINT";
  }

  if (includesPattern(text, BILLING_PATTERNS)) {
    return "BILLING";
  }

  if (includesPattern(text, APPOINTMENT_PATTERNS)) {
    return "APPOINTMENTS";
  }

  if (includesPattern(text, SUPPORT_PATTERNS)) {
    return "SUPPORT";
  }

  if (includesPattern(text, SALES_PATTERNS)) {
    return "SALES";
  }

  return "GENERAL";
};

const resolveUrgencyClass = ({
  text,
  intentClass,
  unresolvedCount,
}: {
  text: string;
  intentClass: string;
  unresolvedCount: number;
}) => {
  if (
    includesPattern(text, URGENT_PATTERNS) ||
    (intentClass === "COMPLAINT" && unresolvedCount > 0)
  ) {
    return unresolvedCount > 1 || intentClass === "ABUSE" ? "CRITICAL" : "HIGH";
  }

  if (["BILLING", "APPOINTMENTS", "COMPLAINT"].includes(intentClass)) {
    return "MEDIUM";
  }

  return "LOW";
};

const resolveSentimentClass = (text: string, intentClass: string) => {
  if (intentClass === "COMPLAINT" || intentClass === "ABUSE") {
    return "NEGATIVE";
  }

  if (includesPattern(text, NEGATIVE_PATTERNS)) {
    return "NEGATIVE";
  }

  if (includesPattern(text, POSITIVE_PATTERNS)) {
    return "POSITIVE";
  }

  return "NEUTRAL";
};

const resolveRouteHint = ({
  intentClass,
  spamScore,
  references,
}: {
  intentClass: string;
  spamScore: number;
  references?: ReceptionContextReferences | null;
}): InboxRouteTarget => {
  if (references?.leadControl?.isHumanControlActive) {
    return "HUMAN_QUEUE";
  }

  if (references?.consent?.status === "REVOKED") {
    return "HUMAN_QUEUE";
  }

  if (spamScore >= 0.85 || intentClass === "SPAM") {
    return "SPAM_BIN";
  }

  switch (intentClass) {
    case "ABUSE":
      return "OWNER";
    case "BILLING":
      return "BILLING";
    case "APPOINTMENTS":
      return "APPOINTMENTS";
    case "COMPLAINT":
    case "SUPPORT":
      return "SUPPORT";
    default:
      return "REVENUE_BRAIN";
  }
};

const extractInteractionMessage = (
  interaction: InboundInteractionAuthorityRecord
) => {
  const normalizedPayload = toRecord(interaction.normalizedPayload);
  return normalizeToken(
    coerceOptionalString(normalizedPayload.message) || "",
    ""
  ).replace(/_/g, " ");
};

export const classifyReceptionInteraction = ({
  interaction,
  references,
  receptionMemory,
}: ReceptionClassifierContext): ReceptionClassification => {
  const normalizedPayload = toRecord(interaction.normalizedPayload);
  const messageText = (
    coerceOptionalString(normalizedPayload.message) ||
    coerceOptionalString(toRecord(normalizedPayload.metadata).subject) ||
    ""
  ).trim();
  const intentClass = resolveIntentClass({
    text: messageText,
    interactionType: interaction.interactionType,
  });
  const spamScore = detectSpamScore(messageText);
  const complaintSeverity =
    intentClass === "COMPLAINT"
      ? clampNumber(
          30 +
            (messageText.length > 120 ? 10 : 0) +
            (receptionMemory?.complaintCount || 0) * 12 +
            (spamScore < 0.4 ? 10 : 0),
          0,
          100
        )
      : 0;
  const urgencyClass = resolveUrgencyClass({
    text: messageText,
    intentClass,
    unresolvedCount: Number(receptionMemory?.unresolvedCount || 0),
  });
  const sentimentClass = resolveSentimentClass(messageText, intentClass);
  const routeHint = resolveRouteHint({
    intentClass,
    spamScore,
    references,
  });
  const reasons = [
    `intent:${intentClass}`,
    `urgency:${urgencyClass}`,
    `sentiment:${sentimentClass}`,
    `route_hint:${routeHint}`,
  ];

  if (spamScore >= 0.85) {
    reasons.push("spam_threshold_exceeded");
  }

  if (references?.leadControl?.isHumanControlActive) {
    reasons.push("lead_human_control_active");
  }

  if (references?.consent?.status === "REVOKED") {
    reasons.push("consent_restricted_fail_closed");
  }

  if ((receptionMemory?.unresolvedCount || 0) > 1) {
    reasons.push("repeat_unresolved_contact");
  }

  if (intentClass === "COMPLAINT" && (receptionMemory?.complaintCount || 0) > 0) {
    reasons.push("repeat_complaint_history");
  }

  return {
    intentClass,
    urgencyClass,
    sentimentClass,
    spamScore,
    routeHint,
    complaintSeverity,
    reasons,
  };
};

export const createPrismaInboundClassificationRepository =
  (): InboundClassificationRepository => ({
    applyClassification: async ({ interactionId, classification }) => {
      return transitionInboundInteraction({
        interactionId,
        expectedCurrentStates: ["NORMALIZED", "CLASSIFIED"],
        nextState: "CLASSIFIED",
        allowSameState: true,
        updates: {
          intentClass: classification.intentClass,
          urgencyClass: classification.urgencyClass,
          sentimentClass: classification.sentimentClass,
          spamScore: classification.spamScore,
        },
        metadata: {
          classificationDecision: {
            intentClass: classification.intentClass,
            urgencyClass: classification.urgencyClass,
            sentimentClass: classification.sentimentClass,
            spamScore: classification.spamScore,
            routeHint: classification.routeHint,
            complaintSeverity: classification.complaintSeverity,
            reasons: classification.reasons,
          },
        },
      });
    },
  });

export const createReceptionClassifierService = ({
  repository = createPrismaInboundClassificationRepository(),
  eventWriter = publishReceptionEvent,
}: {
  repository?: InboundClassificationRepository;
  eventWriter?: ReceptionEventWriter;
} = {}) => ({
  classify: classifyReceptionInteraction,
  applyClassification: async ({
    interaction,
    references,
    receptionMemory,
  }: ReceptionClassifierContext) => {
    const classification = classifyReceptionInteraction({
      interaction,
      references,
      receptionMemory,
    });
    const persisted = await repository.applyClassification({
      interactionId: interaction.id,
      classification,
    });

    await eventWriter({
      event: "inbound.classified",
      businessId: persisted.businessId,
      aggregateType: "inbound_interaction",
      aggregateId: persisted.id,
      eventKey: `${persisted.externalInteractionKey}:classified`,
      payload: {
        interactionId: persisted.id,
        businessId: persisted.businessId,
        leadId: persisted.leadId,
        intentClass: classification.intentClass,
        urgencyClass: classification.urgencyClass,
        sentimentClass: classification.sentimentClass,
        spamScore: classification.spamScore,
        reasons: classification.reasons,
        traceId: persisted.traceId,
      },
    });

    return {
      interaction: persisted,
      classification,
    };
  },
});
