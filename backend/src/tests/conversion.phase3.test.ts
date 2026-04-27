import assert from "node:assert/strict";
import { resolveRevenueConversionStrategy } from "../services/conversion/conversionScore.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const buildBaseContext = (overrides?: Record<string, unknown>) =>
  ({
    businessId: "business_1",
    leadId: "lead_1",
    inputMessage: "Can you share more details?",
    preview: false,
    source: "TEST",
    planContext: {
      planKey: "PRO",
    },
    salesContext: {
      capabilities: {
        primaryCtas: [
          "REPLY_DM",
          "VIEW_DEMO",
          "BOOK_CALL",
          "BUY_NOW",
          "CAPTURE_LEAD",
        ],
        supportBooking: true,
        supportPaymentLinks: true,
      },
      client: {
        faqKnowledge: "We explain process and deliverables clearly.",
        aiTone: "human-confident",
      },
      profile: {
        objection: {
          type: "NONE",
        },
        qualification: {
          missingFields: [],
        },
      },
      optimization: {
        recommendedAngle: "value",
        recommendedCTA: "BOOK_CALL",
        bestCtas: [
          {
            cta: "BOOK_CALL",
            usage: 12,
            conversions: 5,
          },
          {
            cta: "VIEW_DEMO",
            usage: 9,
            conversions: 3,
          },
        ],
        guidance: "Keep it crisp and move to one clear next step.",
      },
    },
    semanticMemory: {
      hits: [
        {
          id: "kb_1",
          sourceType: "FAQ",
        },
      ],
    },
    crmIntelligence: {
      enrichment: {
        profileCompleteness: 82,
        resolvedBudget: "5000",
        resolvedTimeline: "",
      },
      scorecard: {
        compositeScore: 72,
        buyingIntentScore: 70,
      },
      behavior: {
        bookingLikelihood: 68,
        purchaseLikelihood: 54,
        responseLikelihood: 63,
        urgency: "MEDIUM",
        predictedBehavior: "PRICE_EVALUATION",
      },
      relationships: {
        relationshipScore: 64,
        edges: [
          {
            targetType: "COMPANY",
          },
        ],
      },
      value: {
        valueTier: "HIGH",
      },
      segments: {
        primarySegment: "high_value_pipeline",
      },
    },
    ...(overrides || {}),
  }) as any;

const buildBaseIntent = (overrides?: Record<string, unknown>) =>
  ({
    intent: "PRICING",
    confidence: 0.92,
    decisionIntent: "buy",
    objection: "NONE",
    temperature: "WARM",
    stage: "QUALIFIED",
    userSignal: "question",
    ...(overrides || {}),
  }) as any;

const buildBaseState = (overrides?: Record<string, unknown>) =>
  ({
    currentState: "WARM",
    nextState: "HOT",
    allowedTransitions: ["HOT"],
    transitionReason: "test_transition",
    stage: "QUALIFIED",
    aiStage: "HOT",
    directive: "advance",
    conversationStateName: null,
    shouldReply: true,
    ...(overrides || {}),
  }) as any;

const buildBaseSalesDecision = (overrides?: Record<string, unknown>) =>
  ({
    action: "CLOSE",
    priority: 92,
    strategy: "CONVERSION",
    leadState: "HOT",
    intent: "buy",
    emotion: "urgent",
    variant: null,
    cta: "BUY_NOW",
    tone: "decisive-closer",
    structure: "direct_close",
    ctaStyle: "single-clear-cta",
    messageLength: "short",
    replyRate: 42,
    conversionRate: 28,
    revenuePerMessage: 6.5,
    topPatterns: ["direct_close"],
    guidance: "Close when fit is clear.",
    reasoning: ["action:close"],
    ...(overrides || {}),
  }) as any;

export const conversionPhase3Tests: TestCase[] = [
  {
    name: "conversion engine keeps price negotiation ethical",
    run: () => {
      const result = resolveRevenueConversionStrategy({
        context: buildBaseContext({
          inputMessage: "This feels expensive for us right now.",
          salesContext: {
            ...buildBaseContext().salesContext,
            profile: {
              objection: {
                type: "PRICE",
              },
              qualification: {
                missingFields: [],
              },
            },
          },
        }),
        intent: buildBaseIntent({
          objection: "PRICE",
        }),
        state: buildBaseState(),
        route: "SALES",
        salesDecision: buildBaseSalesDecision(),
      });

      assert.ok(result.conversion);
      assert.equal(result.conversion!.objection.primary, "PRICE");
      assert.equal(result.conversion!.negotiation.allowDiscount, false);
      assert.equal(result.conversion!.ethics.approved, true);
      assert.equal(result.conversion!.objection.requiresNegotiation, true);
    },
  },
  {
    name: "conversion engine injects trust and downshifts CTA for trust objections",
    run: () => {
      const result = resolveRevenueConversionStrategy({
        context: buildBaseContext({
          inputMessage: "How do I know this is legit? Any proof?",
          crmIntelligence: {
            ...buildBaseContext().crmIntelligence,
            relationships: {
              relationshipScore: 42,
              edges: [
                { targetType: "TRUST" },
                { targetType: "COMPANY" },
              ],
            },
          },
          salesContext: {
            ...buildBaseContext().salesContext,
            profile: {
              objection: {
                type: "TRUST",
              },
              qualification: {
                missingFields: ["timeline"],
              },
            },
          },
        }),
        intent: buildBaseIntent({
          objection: "TRUST",
          decisionIntent: "doubt",
        }),
        state: buildBaseState(),
        route: "SALES",
        salesDecision: buildBaseSalesDecision({
          cta: "BUY_NOW",
        }),
      });

      assert.ok(result.conversion);
      assert.equal(result.conversion!.trust.level, "strong");
      assert.equal(result.conversion!.cta.cta, "VIEW_DEMO");
      assert.equal(result.conversion!.close.motion, "soft");
      assert.equal(result.salesDecision!.cta, "VIEW_DEMO");
    },
  },
  {
    name: "conversion experiment selection stays deterministic for the same lead",
    run: () => {
      const input = {
        context: buildBaseContext({
          inputMessage: "Can you send a quick walkthrough?",
        }),
        intent: buildBaseIntent({
          objection: "NONE",
          decisionIntent: "explore",
        }),
        state: buildBaseState(),
        route: "SALES" as const,
        salesDecision: buildBaseSalesDecision({
          cta: "VIEW_DEMO",
          action: "HANDLE_OBJECTION",
        }),
      };

      const first = resolveRevenueConversionStrategy(input);
      const second = resolveRevenueConversionStrategy(input);

      assert.ok(first.conversion);
      assert.ok(second.conversion);
      assert.equal(
        first.conversion!.experiment.armKey,
        second.conversion!.experiment.armKey
      );
      assert.equal(first.salesDecision!.cta, second.salesDecision!.cta);
    },
  },
  {
    name: "booking-ready conversion strategy closes directly with high readiness",
    run: () => {
      const result = resolveRevenueConversionStrategy({
        context: buildBaseContext({
          inputMessage: "Can we book this for tomorrow?",
          crmIntelligence: {
            ...buildBaseContext().crmIntelligence,
            enrichment: {
              ...buildBaseContext().crmIntelligence.enrichment,
              resolvedTimeline: "tomorrow",
            },
            scorecard: {
              compositeScore: 91,
              buyingIntentScore: 94,
            },
            behavior: {
              bookingLikelihood: 96,
              purchaseLikelihood: 76,
              responseLikelihood: 84,
              urgency: "HIGH",
              predictedBehavior: "BOOKING_READY",
            },
          },
        }),
        intent: buildBaseIntent({
          intent: "BOOKING",
          objection: "NONE",
          temperature: "HOT",
        }),
        state: buildBaseState({
          nextState: "HOT",
          stage: "BOOKING",
        }),
        route: "BOOKING",
        salesDecision: buildBaseSalesDecision({
          cta: "BOOK_CALL",
          action: "BOOK",
        }),
      });

      assert.ok(result.conversion);
      assert.equal(result.conversion!.bucket, "HIGH");
      assert.equal(result.conversion!.close.motion, "direct");
      assert.equal(result.salesDecision!.cta, "BOOK_CALL");
      assert.equal(result.conversion!.urgency.anchoredToTimeline, true);
    },
  },
];
