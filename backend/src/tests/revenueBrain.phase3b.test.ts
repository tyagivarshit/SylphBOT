import assert from "node:assert/strict";
import { resolveRevenueConversionStrategy } from "../services/conversion/conversionScore.service";
import {
  queueRevenueBrainEvent,
  subscribeRevenueBrainEvent,
  waitForRevenueBrainBackgroundTasks,
} from "../services/revenueBrain/eventBus.service";
import {
  buildRevenueBrainReplyMeta,
  isRevenueBrainDeliveryConfirmed,
  resolveRevenueBrainFinalDecision,
} from "../services/revenueBrain/finalDecision.service";
import {
  buildRevenueBrainCompletedAnalyticsMeta,
  buildRevenueBrainDeliveryReplyEventInput,
} from "../services/revenueBrain/analytics.tracker";
import { resolveTrackingLearningArmKey } from "../services/salesAgent/conversionTracker.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const buildBaseContext = (overrides?: Record<string, unknown>) =>
  ({
    traceId: "trace_phase3b",
    businessId: "business_1",
    leadId: "lead_1",
    inputMessage: "Can you share more details?",
    preview: false,
    source: "QUEUE",
    planContext: {
      planKey: "PRO",
    },
    conversationMemory: {
      summary: "Lead asked about fit and timing.",
    },
    leadMemory: {
      revenueState: "WARM",
      platform: "INSTAGRAM",
      isHumanActive: false,
    },
    salesContext: {
      client: {
        id: "client_1",
        aiTone: "human-confident",
      },
      capabilities: {
        primaryCtas: [
          "REPLY_DM",
          "VIEW_DEMO",
          "BOOK_CALL",
          "BUY_NOW",
          "CAPTURE_LEAD",
        ],
      },
      profile: {
        intentDirective: {
          cta: "BOOK_CALL",
          angle: "value",
        },
        intent: "PRICING",
        intentCategory: "buy",
        objection: {
          type: "NONE",
        },
        qualification: {
          missingFields: [],
        },
        emotion: "curious",
        temperature: "WARM",
      },
      optimization: {
        recommendedCTA: "BOOK_CALL",
        recommendedAngle: "value",
        bestCtas: [
          {
            cta: "BOOK_CALL",
          },
        ],
      },
      memory: {
        facts: [
          {
            stale: false,
          },
        ],
      },
      progression: {
        currentAction: "CLOSE",
        actionPriority: 92,
        funnelPosition: "closing",
      },
      leadState: {
        state: "WARM",
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
      lifecycle: {
        stage: "OPPORTUNITY",
        status: "ACTIVE",
      },
      stateGraph: {
        commercial: {
          state: "WARM",
        },
        booking: {
          state: "OPEN",
        },
      },
      scorecard: {
        compositeScore: 72,
        engagementScore: 64,
        qualificationScore: 70,
        buyingIntentScore: 68,
      },
      value: {
        valueTier: "HIGH",
        valueScore: 74,
        churnScore: 22,
        churnRisk: "LOW",
      },
      segments: {
        primarySegment: "high_value_pipeline",
        secondarySegment: "trust_support",
      },
      relationships: {
        relationshipScore: 64,
        edgeCount: 2,
        summary: "Company-aware lead",
        edges: [
          {
            targetType: "COMPANY",
          },
        ],
      },
      behavior: {
        nextBestAction: "SEND_BOOKING_LINK",
        predictedBehavior: "BOOKING_READY",
        responseLikelihood: 63,
        bookingLikelihood: 68,
        purchaseLikelihood: 54,
        urgency: "MEDIUM",
      },
      enrichment: {
        profileCompleteness: 82,
        resolvedTimeline: "",
        resolvedBudget: "5000",
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
    transitionReason: "advance",
    stage: "QUALIFIED",
    aiStage: "HOT",
    directive: "advance",
    conversationStateName: null,
    shouldReply: true,
    ...(overrides || {}),
  }) as any;

const buildBaseDecision = (overrides?: Record<string, unknown>) =>
  ({
    route: "SALES",
    reasoning: ["sales_action:close"],
    couponRequested: false,
    toolPlan: [],
    salesDecision: {
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
    },
    conversion: {
      score: 84,
      bucket: "HIGH",
      objection: {
        primary: "NONE",
        path: ["NONE", "DIRECT_CTA"],
      },
      trust: {
        level: "none",
        injectionType: "none",
      },
      urgency: {
        level: "light",
        reason: "moderate_buying_momentum_detected",
      },
      negotiation: {
        mode: "none",
      },
      offer: {
        type: "standard",
      },
      close: {
        motion: "direct",
      },
      cta: {
        cta: "BUY_NOW",
        style: "single-clear-cta",
      },
      experiment: {
        armKey: "single_clear_cta",
        variantId: null,
        variantKey: null,
      },
      ethics: {
        approved: true,
        blockedPatterns: [],
        fallbackApplied: false,
        fallbackReason: null,
      },
      persuasion: {
        angle: "urgency",
      },
    },
    ...(overrides || {}),
  }) as any;

const buildReply = (overrides?: Record<string, unknown>) =>
  ({
    message: "Yes, we can help. Want me to book the fastest slot?",
    cta: "BOOK_CALL",
    angle: "urgency",
    reason: "booking_route_selected",
    confidence: 0.94,
    structured: {
      message: "Yes, we can help. Want me to book the fastest slot?",
      intent: "booking",
      stage: "BOOKING",
      leadType: "HIGH",
      cta: "book",
      confidence: 0.94,
      reason: "booking_route_selected",
    },
    source: "BOOKING",
    latencyMs: 12,
    traceId: "trace_phase3b",
    meta: {},
    ...(overrides || {}),
  }) as any;

export const revenueBrainPhase3BTests: TestCase[] = [
  {
    name: "route consistency uses one final resolved decision authority",
    run: () => {
      const context = buildBaseContext();
      const intent = buildBaseIntent();
      const state = buildBaseState({
        stage: "BOOKING",
      });
      const decision = buildBaseDecision();
      const reply = buildReply();
      const toolPlan = [
        {
          name: "booking",
          phase: "before_reply",
          reason: "booking_route",
        },
      ] as any;

      const finalResolvedDecision = resolveRevenueBrainFinalDecision({
        context,
        route: "BOOKING",
        decision,
        reply,
        toolPlan,
      });
      const meta = buildRevenueBrainReplyMeta({
        context,
        intent,
        state,
        reply,
        toolPlan,
        finalResolvedDecision,
      }) as Record<string, any>;

      assert.equal(finalResolvedDecision.route, "BOOKING");
      assert.equal(finalResolvedDecision.action, "BOOK");
      assert.equal(finalResolvedDecision.cta, "BOOK_CALL");
      assert.ok((finalResolvedDecision.priority || 0) >= 90);
      assert.equal(meta.route, "BOOKING");
      assert.equal(meta.decisionAction, "BOOK");
      assert.equal(meta.decisionCTA, "BOOK_CALL");
      assert.equal(meta.finalResolvedDecision.route, "BOOKING");
      assert.equal(meta.revenueBrainSnapshot.route, "BOOKING");
    },
  },
  {
    name: "background event handlers complete asynchronously off the hot path",
    run: async () => {
      let completed = false;
      const unsubscribe = subscribeRevenueBrainEvent(
        "revenue_brain.received",
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 25));
          completed = true;
        }
      );

      void queueRevenueBrainEvent("revenue_brain.received", {
        traceId: "trace_async",
        startedAt: Date.now(),
        input: {
          businessId: "business_1",
          leadId: "lead_1",
          message: "hello",
        },
      } as any);

      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(completed, false);
      await waitForRevenueBrainBackgroundTasks();
      assert.equal(completed, true);
      unsubscribe();
    },
  },
  {
    name: "ethics gate blocks unsafe pressure and regenerates a safe fallback",
    run: () => {
      const result = resolveRevenueConversionStrategy({
        context: buildBaseContext({
          inputMessage: "No thanks, not interested. Please stop pushing this.",
          salesContext: {
            ...buildBaseContext().salesContext,
            profile: {
              ...buildBaseContext().salesContext.profile,
              objection: {
                type: "NOT_INTERESTED",
              },
            },
          },
        }),
        intent: buildBaseIntent({
          objection: "NOT_INTERESTED",
          decisionIntent: "ignore",
        }),
        state: buildBaseState(),
        route: "SALES",
        salesDecision: buildBaseDecision().salesDecision,
      });

      assert.ok(result.conversion);
      assert.equal(result.conversion!.ethics.approved, false);
      assert.equal(result.conversion!.ethics.fallbackApplied, true);
      assert.equal(result.conversion!.close.motion, "soft");
      assert.notEqual(result.salesDecision!.cta, "BUY_NOW");
      assert.ok(
        result.salesDecision!.reasoning.includes("fallback:deterministic_safe")
      );
    },
  },
  {
    name: "learning attribution keeps experiment arms learnable without a variant id",
    run: () => {
      const decision = buildBaseDecision({
        salesDecision: {
          ...buildBaseDecision().salesDecision,
          variant: null,
        },
        conversion: {
          ...buildBaseDecision().conversion,
          experiment: {
            armKey: "proof_then_demo",
            variantId: null,
            variantKey: null,
          },
        },
      });
      const finalResolvedDecision = resolveRevenueBrainFinalDecision({
        context: buildBaseContext(),
        route: "SALES",
        decision,
        reply: buildReply({
          cta: "VIEW_DEMO",
          source: "SALES",
        }),
        toolPlan: [],
      });

      assert.equal(finalResolvedDecision.metadata.variantId, null);
      assert.equal(finalResolvedDecision.metadata.variantKey, "proof_then_demo");
      assert.equal(
        resolveTrackingLearningArmKey({
          variantKey: null,
          metadata: {
            learningArmKey: finalResolvedDecision.metadata.learningArmKey,
            experimentArm: "proof_then_demo",
          },
        }),
        "proof_then_demo"
      );
    },
  },
  {
    name: "delivery truth only marks success after delivery is confirmed",
    run: () => {
      const context = buildBaseContext();
      const intent = buildBaseIntent();
      const state = buildBaseState();
      const decision = buildBaseDecision();
      const reply = buildReply({
        cta: "VIEW_DEMO",
        source: "SALES",
      });
      const finalResolvedDecision = resolveRevenueBrainFinalDecision({
        context,
        route: "SALES",
        decision,
        reply,
        toolPlan: [],
      });
      const meta = buildRevenueBrainReplyMeta({
        context,
        intent,
        state,
        reply,
        toolPlan: [],
        finalResolvedDecision,
      }) as Record<string, any>;
      const completedMeta = buildRevenueBrainCompletedAnalyticsMeta({
        traceId: "trace_delivery",
        startedAt: Date.now(),
        completedAt: Date.now(),
        input: {
          businessId: "business_1",
          leadId: "lead_1",
          message: "Show me proof",
        },
        context,
        intent,
        state,
        decision,
        route: "SALES",
        reply: {
          ...reply,
          meta,
        },
        toolPlan: [],
        tools: [],
        artifacts: {},
        finalResolvedDecision,
        deterministicPlanSnapshot: meta.revenueBrainSnapshot,
      } as any);

      assert.equal(completedMeta.deliveryConfirmed, false);
      assert.equal(
        isRevenueBrainDeliveryConfirmed({
          delivered: false,
          localPreviewOnly: false,
          platform: "INSTAGRAM",
        }),
        false
      );
      assert.equal(
        isRevenueBrainDeliveryConfirmed({
          delivered: true,
          localPreviewOnly: false,
          platform: "INSTAGRAM",
        }),
        true
      );

      const deliveryInput = buildRevenueBrainDeliveryReplyEventInput({
        traceId: "trace_delivery",
        businessId: "business_1",
        leadId: "lead_1",
        messageId: "message_1",
        reply: {
          ...reply,
          meta,
        },
        route: "SALES",
        source: "QUEUE",
        planSnapshot: meta.revenueBrainSnapshot,
        delivery: {
          mode: "platform",
          platform: "INSTAGRAM",
          confirmedAt: Date.now(),
          deliveryJobKey: "job_1",
        },
      } as any);

      assert.equal(deliveryInput.variantKey, "single_clear_cta");
      assert.equal(deliveryInput.platform, "INSTAGRAM");
    },
  },
];
