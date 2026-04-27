import type {
  RevenueBrainContext,
  RevenueBrainIntentResult,
  RevenueBrainStateResult,
} from "../revenueBrain/types";
import type {
  RevenueConversionObjectionGraph,
  RevenueConversionObjectionNode,
} from "./conversionScore.service";

type ObjectionKey = "PRICE" | "TRUST" | "LATER" | "TIME";

type Candidate = {
  key: ObjectionKey;
  score: number;
  signals: string[];
};

const normalize = (value?: unknown) => String(value || "").trim().toUpperCase();

const hasText = (text: string, pattern: RegExp) => pattern.test(text);

const roundConfidence = (value: number) =>
  Math.max(0, Math.min(1, Math.round(value * 100) / 100));

const buildNodes = (
  entries: Array<{
    key: string;
    label: string;
    action: string;
    weight: number;
    next: string[];
  }>
): RevenueConversionObjectionNode[] => entries.map((entry) => ({ ...entry }));

const pushSignal = (
  candidates: Map<ObjectionKey, Candidate>,
  key: ObjectionKey,
  score: number,
  signal: string
) => {
  const current = candidates.get(key) || {
    key,
    score: 0,
    signals: [],
  };

  current.score = Math.max(current.score, score);

  if (!current.signals.includes(signal)) {
    current.signals.push(signal);
  }

  candidates.set(key, current);
};

const buildSemanticCandidates = (text: string) => {
  const candidates = new Map<ObjectionKey, Candidate>();

  if (
    hasText(
      text,
      /\b(too expensive|out of budget|costly|pricey|hard to justify|stretch(?:ing)? the budget)\b/
    )
  ) {
    pushSignal(candidates, "PRICE", 0.92, "price_strong");
  }

  if (hasText(text, /\b(bit much|budget is tight|tight budget|budget issue)\b/)) {
    pushSignal(candidates, "PRICE", 0.74, "price_soft");
  }

  if (
    hasText(
      text,
      /\b(how do i know|too good to be true|is this legit|is this real|can you prove|why should i trust)\b/
    )
  ) {
    pushSignal(candidates, "TRUST", 0.94, "trust_strong");
  }

  if (
    hasText(
      text,
      /\b(any proof|any results|who have you helped|show me proof|proof of results)\b/
    )
  ) {
    pushSignal(candidates, "TRUST", 0.81, "trust_proof");
  }

  if (hasText(text, /\b(any examples|examples of this)\b/)) {
    pushSignal(candidates, "TRUST", 0.58, "trust_examples_soft");
  }

  if (
    hasText(
      text,
      /\b(need to check with|run this by|talk to my|ask my partner|ask my wife|ask my husband|need approval|boss needs to approve|team needs to approve|need the team on board)\b/
    )
  ) {
    pushSignal(candidates, "LATER", 0.88, "later_authority");
  }

  if (
    hasText(
      text,
      /\b(let me think|need some time|need to think|circle back|not ready yet|maybe later|i ll think about it|still thinking)\b/
    )
  ) {
    pushSignal(candidates, "LATER", 0.72, "later_delay");
  }

  if (
    hasText(
      text,
      /\b(busy right now|no time today|swamped|timing is tough)\b/
    )
  ) {
    pushSignal(candidates, "TIME", 0.8, "time_strong");
  }

  if (hasText(text, /\b(later this week|later today|timing later)\b/)) {
    pushSignal(candidates, "TIME", 0.55, "time_soft");
  }

  return candidates;
};

const resolveSemanticDecision = ({
  text,
}: {
  text: string;
}) => {
  const candidates = Array.from(buildSemanticCandidates(text).values());
  const bookingLanguage = hasText(
    text,
    /\b(book|booking|schedule|slot|appointment|meeting|demo|consult|call)\b/
  );

  for (const candidate of candidates) {
    if (
      candidate.key === "TIME" &&
      candidate.signals.includes("time_soft") &&
      bookingLanguage
    ) {
      candidate.score = Math.max(0, candidate.score - 0.2);
      candidate.signals.push("time_disambiguated_by_booking_context");
    }

    if (
      candidate.key === "TRUST" &&
      candidate.signals.includes("trust_examples_soft") &&
      bookingLanguage
    ) {
      candidate.score = Math.min(candidate.score, 0.45);
      candidate.signals.push("trust_examples_softened_by_booking_context");
    }
  }

  const ranked = candidates
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);
  const top = ranked[0] || null;
  const second = ranked[1] || null;

  if (!top || top.score < 0.6) {
    return {
      primary: "NONE",
      confidence: top ? roundConfidence(top.score) : 0.32,
      source: "none" as const,
      disambiguated: ranked.length > 1,
      matchedSignals: top?.signals || [],
      ambiguousWith: ranked.slice(1).map((candidate) => candidate.key),
      reason:
        ranked.length > 0
          ? "semantic_objection_below_confidence_threshold"
          : "no_semantic_objection_detected",
    };
  }

  if (second && top.score - second.score < 0.08 && top.score < 0.85) {
    return {
      primary: "NONE",
      confidence: roundConfidence(top.score),
      source: "none" as const,
      disambiguated: true,
      matchedSignals: top.signals,
      ambiguousWith: [second.key],
      reason: "semantic_objection_ambiguous",
    };
  }

  return {
    primary: top.key,
    confidence: roundConfidence(top.score),
    source: "semantic" as const,
    disambiguated: ranked.length > 1,
    matchedSignals: top.signals,
    ambiguousWith:
      second && top.score - second.score < 0.18 ? [second.key] : [],
    reason: `semantic_${top.key.toLowerCase()}_detected`,
  };
};

const buildResolutionMeta = ({
  explicitPrimary,
  semantic,
}: {
  explicitPrimary: string;
  semantic: ReturnType<typeof resolveSemanticDecision>;
}) => {
  if (explicitPrimary && explicitPrimary !== "NONE") {
    return {
      primary: explicitPrimary,
      confidence: 1,
      source: "explicit" as const,
      disambiguated: semantic.primary !== "NONE",
      matchedSignals: [`explicit:${explicitPrimary.toLowerCase()}`],
      ambiguousWith:
        semantic.primary !== "NONE" && semantic.primary !== explicitPrimary
          ? [semantic.primary]
          : [],
      reason: `explicit_${explicitPrimary.toLowerCase()}_detected`,
    };
  }

  return semantic;
};

export const buildObjectionGraph = ({
  context,
  intent,
}: {
  context: RevenueBrainContext;
  intent: RevenueBrainIntentResult;
  state: RevenueBrainStateResult;
}): RevenueConversionObjectionGraph => {
  const text = normalize(context.inputMessage);
  const explicitPrimary = normalize(
    intent.objection || context.salesContext.profile.objection.type
  );
  const semantic = resolveSemanticDecision({
    text,
  });
  const resolution = buildResolutionMeta({
    explicitPrimary,
    semantic,
  });
  const primary = resolution.primary;

  if (primary === "PRICE") {
    return {
      primary,
      severity:
        hasText(text, /\bTOO EXPENSIVE|OUT OF BUDGET|COSTLY\b/) ? "high" : "medium",
      confidence: resolution.confidence,
      source: resolution.source,
      disambiguated: resolution.disambiguated,
      matchedSignals: resolution.matchedSignals,
      ambiguousWith: resolution.ambiguousWith,
      path: ["PRICE", "VALUE_GAP", "SCOPE_REFRAME", "LOW_RISK_CTA"],
      nodes: buildNodes([
        {
          key: "PRICE",
          label: "Price Objection",
          action: "Acknowledge the budget friction without defending price emotionally.",
          weight: 82,
          next: ["VALUE_GAP"],
        },
        {
          key: "VALUE_GAP",
          label: "Value Gap",
          action: "Tie the offer to the lead's specific outcome before any close attempt.",
          weight: 78,
          next: ["SCOPE_REFRAME", "NEGOTIATION_GUARD"],
        },
        {
          key: "SCOPE_REFRAME",
          label: "Scope Reframe",
          action: "Reframe around fit, scope, or staged next steps rather than discounting.",
          weight: 72,
          next: ["LOW_RISK_CTA"],
        },
        {
          key: "LOW_RISK_CTA",
          label: "Low Risk CTA",
          action: "Use a low-friction CTA such as a fit check or walkthrough.",
          weight: 68,
          next: [],
        },
      ]),
      requiresTrust: false,
      requiresNegotiation: true,
      shouldDownshiftCTA: true,
      reason: resolution.reason,
    };
  }

  if (primary === "TRUST") {
    return {
      primary,
      severity: "high",
      confidence: resolution.confidence,
      source: resolution.source,
      disambiguated: resolution.disambiguated,
      matchedSignals: resolution.matchedSignals,
      ambiguousWith: resolution.ambiguousWith,
      path: ["TRUST", "PROOF_STACK", "TRANSPARENCY", "SAFE_CTA"],
      nodes: buildNodes([
        {
          key: "TRUST",
          label: "Trust Objection",
          action: "Acknowledge uncertainty and lower the emotional temperature.",
          weight: 90,
          next: ["PROOF_STACK"],
        },
        {
          key: "PROOF_STACK",
          label: "Proof Stack",
          action: "Use only verifiable proof signals already present in context.",
          weight: 84,
          next: ["TRANSPARENCY"],
        },
        {
          key: "TRANSPARENCY",
          label: "Transparent Process",
          action: "Explain the next step plainly so the lead knows what happens next.",
          weight: 78,
          next: ["SAFE_CTA"],
        },
        {
          key: "SAFE_CTA",
          label: "Safe CTA",
          action: "Offer a proof-backed CTA instead of a hard close.",
          weight: 72,
          next: [],
        },
      ]),
      requiresTrust: true,
      requiresNegotiation: false,
      shouldDownshiftCTA: true,
      reason: resolution.reason,
    };
  }

  if (primary === "TIME") {
    return {
      primary,
      severity: "medium",
      confidence: resolution.confidence,
      source: resolution.source,
      disambiguated: resolution.disambiguated,
      matchedSignals: resolution.matchedSignals,
      ambiguousWith: resolution.ambiguousWith,
      path: ["TIME", "FRICTION_REDUCTION", "FASTEST_PATH"],
      nodes: buildNodes([
        {
          key: "TIME",
          label: "Time Objection",
          action: "Acknowledge the time constraint and avoid long explanations.",
          weight: 76,
          next: ["FRICTION_REDUCTION"],
        },
        {
          key: "FRICTION_REDUCTION",
          label: "Friction Reduction",
          action: "Compress the ask into the smallest useful next step.",
          weight: 74,
          next: ["FASTEST_PATH"],
        },
        {
          key: "FASTEST_PATH",
          label: "Fastest Path",
          action: "Use a simple scheduling or reply CTA that can be completed quickly.",
          weight: 69,
          next: [],
        },
      ]),
      requiresTrust: false,
      requiresNegotiation: false,
      shouldDownshiftCTA: true,
      reason: resolution.reason,
    };
  }

  if (primary === "LATER") {
    const authoritySignal = hasText(
      text,
      /\b(need to check with|run this by|talk to my|ask my partner|ask my wife|ask my husband|need approval|boss needs to approve|team needs to approve|need the team on board)\b/
    );

    return {
      primary,
      severity: "medium",
      confidence: resolution.confidence,
      source: resolution.source,
      disambiguated: resolution.disambiguated,
      matchedSignals: resolution.matchedSignals,
      ambiguousWith: resolution.ambiguousWith,
      path: authoritySignal
        ? ["LATER", "AUTHORITY_ALIGNMENT", "LIGHT_URGENCY", "EASY_REENTRY"]
        : ["LATER", "TIMELINE_PROBE", "LIGHT_URGENCY", "EASY_REENTRY"],
      nodes: buildNodes([
        {
          key: "LATER",
          label: "Delay Objection",
          action: "Respect the hesitation and avoid acting like later means never.",
          weight: 74,
          next: authoritySignal ? ["AUTHORITY_ALIGNMENT"] : ["TIMELINE_PROBE"],
        },
        ...(authoritySignal
          ? [
              {
                key: "AUTHORITY_ALIGNMENT",
                label: "Authority Alignment",
                action:
                  "Make it easy for the lead to validate fit with the other decision-maker instead of pushing for a solo close.",
                weight: 72,
                next: ["LIGHT_URGENCY", "EASY_REENTRY"],
              },
            ]
          : [
              {
                key: "TIMELINE_PROBE",
                label: "Timeline Probe",
                action: "Clarify whether later means hours, days, or weeks.",
                weight: 71,
                next: ["LIGHT_URGENCY", "EASY_REENTRY"],
              },
            ]),
        {
          key: "LIGHT_URGENCY",
          label: "Light Urgency",
          action: "Use only buyer-anchored urgency, never fake deadlines.",
          weight: 66,
          next: ["EASY_REENTRY"],
        },
        {
          key: "EASY_REENTRY",
          label: "Easy Re-entry CTA",
          action: "Give a low-friction next step so momentum stays alive.",
          weight: 62,
          next: [],
        },
      ]),
      requiresTrust: false,
      requiresNegotiation: false,
      shouldDownshiftCTA: true,
      reason: resolution.reason,
    };
  }

  if (explicitPrimary === "NOT_INTERESTED") {
    return {
      primary: "NOT_INTERESTED",
      severity: "high",
      confidence: 1,
      source: "explicit",
      disambiguated: semantic.primary !== "NONE",
      matchedSignals: ["explicit:not_interested"],
      ambiguousWith:
        semantic.primary !== "NONE" ? [semantic.primary] : [],
      path: ["NOT_INTERESTED", "RESPECTFUL_EXIT", "MICRO_RELEVANCE_CHECK"],
      nodes: buildNodes([
        {
          key: "NOT_INTERESTED",
          label: "Disinterest",
          action: "Respect the signal immediately and avoid pressure.",
          weight: 95,
          next: ["RESPECTFUL_EXIT"],
        },
        {
          key: "RESPECTFUL_EXIT",
          label: "Respectful Exit",
          action: "Offer a low-pressure opt-in instead of a close.",
          weight: 90,
          next: ["MICRO_RELEVANCE_CHECK"],
        },
        {
          key: "MICRO_RELEVANCE_CHECK",
          label: "Micro Relevance Check",
          action: "Use only a lightweight relevance question if any reply makes sense.",
          weight: 58,
          next: [],
        },
      ]),
      requiresTrust: false,
      requiresNegotiation: false,
      shouldDownshiftCTA: true,
      reason: "explicit_disinterest_detected",
    };
  }

  const strongBuyingSignal =
    context.crmIntelligence.behavior.bookingLikelihood >= 80 ||
    context.crmIntelligence.behavior.purchaseLikelihood >= 75;

  return {
    primary: "NONE",
    severity: strongBuyingSignal ? "low" : "medium",
    confidence: strongBuyingSignal ? 0.88 : 0.72,
    source: "none",
    disambiguated: semantic.reason === "semantic_objection_ambiguous",
    matchedSignals:
      semantic.reason === "semantic_objection_ambiguous"
        ? semantic.matchedSignals
        : [strongBuyingSignal ? "buyer_ready_signal" : "default_progression"],
    ambiguousWith: semantic.ambiguousWith,
    path: strongBuyingSignal
      ? ["NONE", "READY_TO_ADVANCE", "DIRECT_CTA"]
      : ["NONE", "CLARIFY_AND_ADVANCE", "SINGLE_CTA"],
    nodes: buildNodes(
      strongBuyingSignal
        ? [
            {
              key: "READY_TO_ADVANCE",
              label: "Ready To Advance",
              action: "Do not reopen discovery; move directly to the next step.",
              weight: 82,
              next: ["DIRECT_CTA"],
            },
            {
              key: "DIRECT_CTA",
              label: "Direct CTA",
              action: "Use the most direct ethical CTA available.",
              weight: 78,
              next: [],
            },
          ]
        : [
            {
              key: "CLARIFY_AND_ADVANCE",
              label: "Clarify And Advance",
              action: "Answer the question clearly, then advance with one CTA.",
              weight: 64,
              next: ["SINGLE_CTA"],
            },
            {
              key: "SINGLE_CTA",
              label: "Single CTA",
              action: "Avoid multiple branches; keep one next step only.",
              weight: 60,
              next: [],
            },
          ]
    ),
    requiresTrust: false,
    requiresNegotiation: false,
    shouldDownshiftCTA: false,
    reason:
      semantic.reason === "semantic_objection_ambiguous"
        ? semantic.reason
        : strongBuyingSignal
          ? "objection_absent_and_buyer_ready"
          : "objection_absent_default_progression",
  };
};
