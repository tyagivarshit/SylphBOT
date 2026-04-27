import type {
  RevenueBrainContext,
  RevenueBrainIntentResult,
  RevenueBrainRoute,
  RevenueBrainStateResult,
} from "../revenueBrain/types";
import type {
  SalesAngle,
  SalesCTA,
  SalesDecisionAction,
  SalesDecisionStrategy,
} from "../salesAgent/types";
import { buildDynamicCtaPlan } from "./cta.engine";
import { buildClosePlan } from "./close.engine";
import { buildExperimentPlan } from "./experiment.engine";
import { buildNegotiationPlan } from "./negotiation.engine";
import { buildObjectionGraph } from "./objection.engine";
import { buildOfferPlan } from "./offer.engine";
import { buildBuyerPersuasionProfile } from "./persuasion.engine";
import { buildTrustPlan } from "./trust.engine";
import { buildUrgencyPlan } from "./urgency.engine";

export type RevenueConversionScoreBucket = "LOW" | "MEDIUM" | "HIGH";

export type RevenueConversionBuyerProfile = {
  archetype:
    | "ANALYTICAL"
    | "SKEPTICAL"
    | "DECISIVE"
    | "RELATIONAL"
    | "EXPLORER";
  trustNeed: number;
  urgencySensitivity: number;
  priceSensitivity: number;
  proofPreference: number;
  negotiationLikelihood: number;
  recommendedAngle: SalesAngle;
  recommendedTone: string;
  recommendedLength: "short" | "medium";
  reason: string;
};

export type RevenueConversionObjectionNode = {
  key: string;
  label: string;
  action: string;
  weight: number;
  next: string[];
};

export type RevenueConversionObjectionGraph = {
  primary: string;
  severity: "low" | "medium" | "high";
  confidence: number;
  source: "explicit" | "semantic" | "inferred" | "none";
  disambiguated: boolean;
  matchedSignals: string[];
  ambiguousWith: string[];
  path: string[];
  nodes: RevenueConversionObjectionNode[];
  requiresTrust: boolean;
  requiresNegotiation: boolean;
  shouldDownshiftCTA: boolean;
  reason: string;
};

export type RevenueConversionPersuasionPlan = {
  buyer: RevenueConversionBuyerProfile;
  strategy: "EDUCATE" | "PROVE" | "REDUCE_FRICTION" | "CLOSE";
  angle: SalesAngle;
  tone: string;
  structure: string;
  tactics: string[];
  reason: string;
};

export type RevenueConversionTrustPlan = {
  level: "none" | "light" | "strong";
  injectionType:
    | "none"
    | "company_context"
    | "relationship_proof"
    | "transparent_process"
    | "faq_specificity"
    | "risk_reversal";
  injections: string[];
  signalKeys: string[];
  score: number;
  reason: string;
};

export type RevenueConversionUrgencyPlan = {
  level: "none" | "light" | "timed" | "critical";
  frame: string;
  anchoredToTimeline: boolean;
  windowLabel: string | null;
  reason: string;
};

export type RevenueConversionNegotiationPlan = {
  mode:
    | "none"
    | "clarify_scope"
    | "anchor_value"
    | "package_reframe"
    | "offer_tradeoff";
  allowDiscount: boolean;
  askForBudget: boolean;
  responseGuardrail: string;
  reason: string;
};

export type RevenueConversionOfferPlan = {
  type:
    | "standard"
    | "proof_offer"
    | "booking_offer"
    | "scope_reframe"
    | "retention_offer";
  headline: string;
  riskReversal: string | null;
  incentive: string | null;
  reason: string;
};

export type RevenueConversionExperimentPlan = {
  armKey: string;
  label: string;
  variantId: string | null;
  variantKey: string | null;
  ctaStyle: string;
  messageLength: "short" | "medium";
  confidence: number;
  reason: string;
};

export type RevenueConversionCtaCandidate = {
  cta: SalesCTA;
  score: number;
  reason: string;
};

export type RevenueConversionCtaPlan = {
  cta: SalesCTA;
  style: string;
  label: string;
  score: number;
  candidates: RevenueConversionCtaCandidate[];
  reason: string;
};

export type RevenueConversionClosePlan = {
  motion: "soft" | "assumptive" | "direct" | "handoff";
  pressureCap: "low" | "medium";
  closingDirective: string;
  reason: string;
};

export type RevenueConversionDecision = {
  score: number;
  bucket: RevenueConversionScoreBucket;
  buyer: RevenueConversionBuyerProfile;
  objection: RevenueConversionObjectionGraph;
  persuasion: RevenueConversionPersuasionPlan;
  cta: RevenueConversionCtaPlan;
  trust: RevenueConversionTrustPlan;
  urgency: RevenueConversionUrgencyPlan;
  negotiation: RevenueConversionNegotiationPlan;
  offer: RevenueConversionOfferPlan;
  close: RevenueConversionClosePlan;
  experiment: RevenueConversionExperimentPlan;
  ethics: {
    approved: boolean;
    rules: string[];
    blockedPatterns: string[];
    fallbackApplied: boolean;
    fallbackReason: string | null;
  };
  reasoning: string[];
  observability: {
    signalSummary: string[];
    metrics: Record<string, number>;
  };
};

type ResolveRevenueConversionInput = {
  context: RevenueBrainContext;
  intent: RevenueBrainIntentResult;
  state: RevenueBrainStateResult;
  route: RevenueBrainRoute;
  salesDecision: SalesDecisionAction | null;
};

export type RevenueConversionResolution = {
  salesDecision: SalesDecisionAction | null;
  conversion: RevenueConversionDecision | null;
};

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(value)));

const resolveScoreBucket = (score: number): RevenueConversionScoreBucket => {
  if (score >= 78) {
    return "HIGH";
  }

  if (score >= 52) {
    return "MEDIUM";
  }

  return "LOW";
};

const pickStrategy = ({
  score,
  objectionSeverity,
  trustNeed,
  route,
  baseStrategy,
}: {
  score: number;
  objectionSeverity: RevenueConversionObjectionGraph["severity"];
  trustNeed: number;
  route: RevenueBrainRoute;
  baseStrategy: SalesDecisionStrategy;
}): SalesDecisionStrategy => {
  if (route === "BOOKING" || score >= 82) {
    return "CONVERSION";
  }

  if (objectionSeverity === "high" || trustNeed >= 70) {
    return "BALANCED";
  }

  return baseStrategy;
};

const unique = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

const buildGuidance = ({
  persuasion,
  objection,
  trust,
  urgency,
  negotiation,
  offer,
  close,
  cta,
}: {
  persuasion: RevenueConversionPersuasionPlan;
  objection: RevenueConversionObjectionGraph;
  trust: RevenueConversionTrustPlan;
  urgency: RevenueConversionUrgencyPlan;
  negotiation: RevenueConversionNegotiationPlan;
  offer: RevenueConversionOfferPlan;
  close: RevenueConversionClosePlan;
  cta: RevenueConversionCtaPlan;
}) =>
  [
    `Strategy: ${persuasion.strategy.toLowerCase()}.`,
    `Buyer: ${persuasion.buyer.archetype.toLowerCase()}.`,
    objection.primary !== "NONE"
      ? `Handle objection path ${objection.path.join(" -> ")} first.`
      : null,
    trust.level !== "none"
      ? `Inject trust via ${trust.injectionType.replace(/_/g, " ")}.`
      : null,
    urgency.level !== "none"
      ? `Use ${urgency.level} urgency only because ${urgency.reason.replace(/_/g, " ")}.`
      : null,
    negotiation.mode !== "none"
      ? `Negotiation mode: ${negotiation.mode.replace(/_/g, " ")}.`
      : null,
    `Offer frame: ${offer.type.replace(/_/g, " ")}.`,
    `Close with a ${close.motion} ${cta.label.toLowerCase()} ask.`,
    "Stay ethical: no fake scarcity, no fabricated proof, no invented discounts.",
  ]
    .filter(Boolean)
    .join(" ");

const buildEthics = ({
  objection,
  cta,
  close,
  urgency,
  trust,
  negotiation,
}: {
  objection: RevenueConversionObjectionGraph;
  cta: RevenueConversionCtaPlan;
  close: RevenueConversionClosePlan;
  urgency: RevenueConversionUrgencyPlan;
  trust: RevenueConversionTrustPlan;
  negotiation: RevenueConversionNegotiationPlan;
}) => {
  const blockedPatterns: string[] = [];

  if (urgency.level === "critical" && !urgency.anchoredToTimeline) {
    blockedPatterns.push("critical_urgency_without_buyer_timeline");
  }

  if (trust.injections.some((item) => /testimonial|case study/i.test(item))) {
    blockedPatterns.push("unverified_specific_proof_claim");
  }

  if (negotiation.allowDiscount) {
    blockedPatterns.push("implicit_discounting");
  }

  if (objection.primary === "NOT_INTERESTED") {
    blockedPatterns.push("explicit_disinterest_hard_gate");
  }

  if (
    objection.primary === "NOT_INTERESTED" &&
    (cta.cta === "BUY_NOW" || cta.cta === "BOOK_CALL" || close.motion !== "soft")
  ) {
    blockedPatterns.push("pressure_after_explicit_disinterest");
  }

  if (
    objection.requiresTrust &&
    (cta.cta === "BUY_NOW" || close.motion === "direct")
  ) {
    blockedPatterns.push("trust_gap_hard_close");
  }

  return {
    approved: blockedPatterns.length === 0,
    rules: [
      "use real buyer signals only",
      "no fake scarcity",
      "no fabricated testimonials or guarantees",
      "no pressure after explicit disinterest",
    ],
    blockedPatterns,
    fallbackApplied: false,
    fallbackReason: null,
  };
};

const scoreConversionReadiness = ({
  context,
  route,
  objection,
  persuasion,
  trust,
  urgency,
  negotiation,
  cta,
}: {
  context: RevenueBrainContext;
  route: RevenueBrainRoute;
  objection: RevenueConversionObjectionGraph;
  persuasion: RevenueConversionPersuasionPlan;
  trust: RevenueConversionTrustPlan;
  urgency: RevenueConversionUrgencyPlan;
  negotiation: RevenueConversionNegotiationPlan;
  cta: RevenueConversionCtaPlan;
}) => {
  const crm = context.crmIntelligence;
  let score =
    crm.scorecard.compositeScore * 0.34 +
    crm.scorecard.buyingIntentScore * 0.22 +
    crm.behavior.bookingLikelihood * 0.14 +
    crm.behavior.purchaseLikelihood * 0.14 +
    crm.behavior.responseLikelihood * 0.08 +
    crm.relationships.relationshipScore * 0.08;

  if (route === "BOOKING") {
    score += 8;
  }

  if (objection.severity === "high") {
    score -= 16;
  } else if (objection.severity === "medium") {
    score -= 8;
  }

  if (trust.level === "strong") {
    score -= 16;
  } else if (trust.level === "light") {
    score -= 7;
  } else if (trust.level === "none" && objection.requiresTrust) {
    score -= 12;
  } else if (crm.relationships.relationshipScore >= 70) {
    score += 4;
  }

  if (crm.relationships.relationshipScore < 50) {
    score -= 8;
  }

  if (persuasion.buyer.archetype === "SKEPTICAL") {
    score -= 10;
  }

  if (urgency.level === "timed") {
    score += 4;
  } else if (urgency.level === "critical") {
    score += 6;
  }

  if (negotiation.mode !== "none") {
    score -= 4;
  }

  if (cta.cta === "BOOK_CALL" || cta.cta === "BUY_NOW") {
    score += 3;
  }

  return clamp(score);
};

const buildSafeFallbackPlan = ({
  context,
  route,
  base,
  score,
  persuasion,
  objection,
  trust,
  urgency,
  negotiation,
  experiment,
  ethics,
}: {
  context: RevenueBrainContext;
  route: RevenueBrainRoute;
  base: SalesDecisionAction;
  score: number;
  persuasion: RevenueConversionPersuasionPlan;
  objection: RevenueConversionObjectionGraph;
  trust: RevenueConversionTrustPlan;
  urgency: RevenueConversionUrgencyPlan;
  negotiation: RevenueConversionNegotiationPlan;
  experiment: RevenueConversionExperimentPlan;
  ethics: RevenueConversionDecision["ethics"];
}) => {
  const safeCta: RevenueConversionCtaPlan =
    objection.primary === "NOT_INTERESTED"
      ? {
          cta: context.salesContext.capabilities.primaryCtas.includes("REPLY_DM")
            ? "REPLY_DM"
            : "NONE",
          style: "soft-question",
          label: "Reply",
          score: 0,
          candidates: [],
          reason: "ethics_safe_disinterest_fallback",
        }
      : trust.level === "strong" || objection.requiresTrust
        ? {
            cta: context.salesContext.capabilities.primaryCtas.includes("VIEW_DEMO")
              ? "VIEW_DEMO"
              : "REPLY_DM",
            style: "proof-backed",
            label: "View Demo",
            score: 0,
            candidates: [],
            reason: "ethics_safe_trust_fallback",
          }
        : route === "BOOKING"
          ? {
              cta: context.salesContext.capabilities.primaryCtas.includes("BOOK_CALL")
                ? "BOOK_CALL"
                : "VIEW_DEMO",
              style: "direct-booking",
              label: "Book Call",
              score: 0,
              candidates: [],
              reason: "ethics_safe_booking_fallback",
            }
          : {
              cta: context.salesContext.capabilities.primaryCtas.includes("REPLY_DM")
                ? "REPLY_DM"
                : base.cta,
              style: "single-clear-cta",
              label: "Reply",
              score: 0,
              candidates: [],
              reason: "ethics_safe_default_fallback",
            };

  const safeUrgency: RevenueConversionUrgencyPlan =
    urgency.level === "critical" && !urgency.anchoredToTimeline
      ? {
          ...urgency,
          level: "light",
          frame:
            "Remove pressure and keep the next step clear until the buyer provides a real timeline.",
          reason: "ethics_removed_unanchored_urgency",
        }
      : urgency;

  const safeClose: RevenueConversionClosePlan = {
    motion: "soft",
    pressureCap: "low",
    closingDirective:
      "Use a transparent, low-pressure next step that preserves buyer agency.",
    reason: "ethics_safe_close_fallback",
  };

  const safeOffer: RevenueConversionOfferPlan =
    trust.level === "strong" || objection.requiresTrust
      ? {
          type: "proof_offer",
          headline: "Offer a transparent proof-first next step.",
          riskReversal: null,
          incentive: null,
          reason: "ethics_safe_proof_offer",
        }
      : {
          type: "standard",
          headline: "Keep the offer plain and reversible.",
          riskReversal: null,
          incentive: null,
          reason: "ethics_safe_standard_offer",
        };

  const safeExperiment: RevenueConversionExperimentPlan = {
    ...experiment,
    armKey: `safety_${objection.primary.toLowerCase() || "default"}`,
    label: "Safety Fallback",
    variantId: null,
    variantKey: null,
    ctaStyle: safeCta.style,
    messageLength:
      objection.severity === "high" || trust.level === "strong"
        ? "medium"
        : "short",
    confidence: 1,
    reason: "ethics_blocked_deterministic_fallback",
  };

  const safeDecision = buildAdjustedSalesDecision({
    base,
    route,
    score: Math.max(18, Math.min(score, 58)),
    persuasion: {
      ...persuasion,
      strategy: trust.level === "strong" ? "PROVE" : "REDUCE_FRICTION",
      tone:
        trust.level === "strong"
          ? "calm-transparent"
          : objection.primary === "NOT_INTERESTED"
            ? "respectful-low-pressure"
            : persuasion.tone,
    },
    objection,
    trust,
    urgency: safeUrgency,
    negotiation: {
      ...negotiation,
      allowDiscount: false,
    },
    offer: safeOffer,
    close: safeClose,
    cta: safeCta,
    experiment: safeExperiment,
  });

  const safeEthics = {
    ...ethics,
    fallbackApplied: true,
    fallbackReason: "deterministic_safe_fallback",
  };

  return {
    adjustedDecision: {
      ...safeDecision,
      reasoning: unique([
        ...safeDecision.reasoning,
        ...safeEthics.blockedPatterns.map((pattern) => `ethics_blocked:${pattern}`),
        "fallback:deterministic_safe",
      ]),
    },
    cta: safeCta,
    urgency: safeUrgency,
    offer: safeOffer,
    close: safeClose,
    experiment: safeExperiment,
    ethics: safeEthics,
  };
};

const resolveMessageLength = ({
  experiment,
  persuasion,
  objection,
}: {
  experiment: RevenueConversionExperimentPlan;
  persuasion: RevenueConversionPersuasionPlan;
  objection: RevenueConversionObjectionGraph;
}) => {
  if (objection.severity === "high") {
    return "medium";
  }

  return experiment.messageLength || persuasion.buyer.recommendedLength;
};

const buildAdjustedSalesDecision = ({
  base,
  route,
  score,
  persuasion,
  objection,
  trust,
  urgency,
  negotiation,
  offer,
  close,
  cta,
  experiment,
}: {
  base: SalesDecisionAction;
  route: RevenueBrainRoute;
  score: number;
  persuasion: RevenueConversionPersuasionPlan;
  objection: RevenueConversionObjectionGraph;
  trust: RevenueConversionTrustPlan;
  urgency: RevenueConversionUrgencyPlan;
  negotiation: RevenueConversionNegotiationPlan;
  offer: RevenueConversionOfferPlan;
  close: RevenueConversionClosePlan;
  cta: RevenueConversionCtaPlan;
  experiment: RevenueConversionExperimentPlan;
}): SalesDecisionAction => {
  const strategy = pickStrategy({
    score,
    objectionSeverity: objection.severity,
    trustNeed: persuasion.buyer.trustNeed,
    route,
    baseStrategy: base.strategy,
  });
  const messageLength = resolveMessageLength({
    experiment,
    persuasion,
    objection,
  });
  const structure =
    close.motion === "direct"
      ? "direct_close"
      : objection.primary !== "NONE"
        ? persuasion.structure
        : offer.type === "proof_offer"
          ? "value_proof_cta"
          : persuasion.structure;
  const reasoning = unique([
    ...base.reasoning,
    ...persuasion.tactics.map((item) => `tactic:${item}`),
    `conversion_score:${score}`,
    `conversion_bucket:${resolveScoreBucket(score).toLowerCase()}`,
    `buyer:${persuasion.buyer.archetype.toLowerCase()}`,
    `objection:${objection.primary.toLowerCase()}`,
    `trust:${trust.level}`,
    `urgency:${urgency.level}`,
    `negotiation:${negotiation.mode}`,
    `offer:${offer.type}`,
    `close:${close.motion}`,
    `experiment:${experiment.armKey}`,
    `cta:${cta.cta}`,
  ]);

  return {
    ...base,
    strategy,
    cta: cta.cta,
    tone: persuasion.tone,
    structure,
    ctaStyle: experiment.ctaStyle || cta.style || base.ctaStyle,
    messageLength,
    guidance: buildGuidance({
      persuasion,
      objection,
      trust,
      urgency,
      negotiation,
      offer,
      close,
      cta,
    }),
    topPatterns: unique([
      ...base.topPatterns,
      structure,
      `offer:${offer.type}`,
      `experiment:${experiment.armKey}`,
      trust.level !== "none" ? `trust:${trust.injectionType}` : null,
    ]).slice(0, 5),
    reasoning,
  };
};

export const summarizeRevenueConversionDecision = (
  conversion: RevenueConversionDecision | null
) => {
  if (!conversion) {
    return "No conversion strategy was applied.";
  }

  return [
    `Conversion score ${conversion.score} (${conversion.bucket}).`,
    `Buyer ${conversion.buyer.archetype.toLowerCase()} with ${conversion.objection.primary.toLowerCase()} objection path.`,
    `CTA ${conversion.cta.cta} via ${conversion.experiment.armKey}.`,
    `Trust ${conversion.trust.level}, urgency ${conversion.urgency.level}, negotiation ${conversion.negotiation.mode}.`,
  ].join(" ");
};

export const resolveRevenueConversionStrategy = ({
  context,
  intent,
  state,
  route,
  salesDecision,
}: ResolveRevenueConversionInput): RevenueConversionResolution => {
  if (!salesDecision || route === "NO_REPLY" || route === "ESCALATE") {
    return {
      salesDecision,
      conversion: null,
    };
  }

  const objection = buildObjectionGraph({
    context,
    intent,
    state,
  });
  const trust = buildTrustPlan({
    context,
    intent,
    objection,
  });
  const urgency = buildUrgencyPlan({
    context,
    intent,
    route,
  });
  const persuasion = buildBuyerPersuasionProfile({
    context,
    intent,
    route,
    objection,
    trust,
    urgency,
    salesDecision,
  });
  const experiment = buildExperimentPlan({
    context,
    route,
    salesDecision,
    persuasion,
    objection,
  });
  const negotiation = buildNegotiationPlan({
    context,
    objection,
    urgency,
  });
  const offer = buildOfferPlan({
    context,
    route,
    objection,
    trust,
    urgency,
    negotiation,
  });
  const cta = buildDynamicCtaPlan({
    context,
    route,
    salesDecision,
    objection,
    persuasion,
    trust,
    urgency,
    experiment,
  });
  const score = scoreConversionReadiness({
    context,
    route,
    objection,
    persuasion,
    trust,
    urgency,
    negotiation,
    cta,
  });
  const close = buildClosePlan({
    context,
    route,
    score,
    objection,
    trust,
    urgency,
    cta,
  });
  const ethics = buildEthics({
    objection,
    cta,
    close,
    urgency,
    trust,
    negotiation,
  });
  let adjustedDecision = buildAdjustedSalesDecision({
    base: salesDecision,
    route,
    score,
    persuasion,
    objection,
    trust,
    urgency,
    negotiation,
    offer,
    close,
    cta,
    experiment,
  });
  let finalCta = cta;
  let finalUrgency = urgency;
  let finalOffer = offer;
  let finalClose = close;
  let finalExperiment = experiment;
  let finalEthics = ethics;

  if (!ethics.approved) {
    const safeFallback = buildSafeFallbackPlan({
      context,
      route,
      base: salesDecision,
      score,
      persuasion,
      objection,
      trust,
      urgency,
      negotiation,
      experiment,
      ethics,
    });

    adjustedDecision = safeFallback.adjustedDecision;
    finalCta = safeFallback.cta;
    finalUrgency = safeFallback.urgency;
    finalOffer = safeFallback.offer;
    finalClose = safeFallback.close;
    finalExperiment = safeFallback.experiment;
    finalEthics = safeFallback.ethics;
  }

  const conversion: RevenueConversionDecision = {
    score,
    bucket: resolveScoreBucket(score),
    buyer: persuasion.buyer,
    objection,
    persuasion,
    cta: finalCta,
    trust,
    urgency: finalUrgency,
    negotiation,
    offer: finalOffer,
    close: finalClose,
    experiment: finalExperiment,
    ethics: finalEthics,
    reasoning: adjustedDecision.reasoning,
    observability: {
      signalSummary: [
        `crm:${context.crmIntelligence.scorecard.compositeScore}`,
        `behavior:${context.crmIntelligence.behavior.predictedBehavior}`,
        `segment:${context.crmIntelligence.segments.primarySegment}`,
        `objection:${objection.primary}`,
        `cta:${finalCta.cta}`,
        `experiment:${finalExperiment.armKey}`,
      ],
      metrics: {
        compositeScore: context.crmIntelligence.scorecard.compositeScore,
        buyingIntentScore: context.crmIntelligence.scorecard.buyingIntentScore,
        responseLikelihood: context.crmIntelligence.behavior.responseLikelihood,
        bookingLikelihood: context.crmIntelligence.behavior.bookingLikelihood,
        purchaseLikelihood: context.crmIntelligence.behavior.purchaseLikelihood,
        relationshipScore: context.crmIntelligence.relationships.relationshipScore,
        trustScore: trust.score,
        conversionScore: score,
      },
    },
  };

  return {
    salesDecision: adjustedDecision,
    conversion,
  };
};
