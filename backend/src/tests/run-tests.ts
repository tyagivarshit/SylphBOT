import assert from "node:assert/strict";
import { predictLeadBehavior } from "../services/crm/behavior.service";
import { buildCustomerGraph } from "../services/crm/customerGraph.service";
import {
  __crmIntelligenceTestInternals,
  buildLeadIntelligenceFromSnapshot,
} from "../services/crm/leadIntelligence.service";
import { assessLeadLifecycle } from "../services/crm/lifecycle.service";
import {
  createDebouncedRefreshQueue,
  runDirtyRefreshLoop,
} from "../services/crm/refreshQueue.service";
import { mapLeadRelationships } from "../services/crm/relationship.service";
import { predictLeadValue } from "../services/crm/valuePrediction.service";
import {
  collapseMemoryFacts,
  computeMemoryDecay,
  selectRelevantMemoryFacts,
} from "../services/revenueBrain/memory.utils";
import { resolveDeterministicRevenueState } from "../services/revenueBrain/stateMachine.rules";
import { buildRevenueBrainToolPlan } from "../services/revenueBrain/toolPlan.service";
import { __slotLockTestInternals } from "../services/slotLock.service";
import { autonomousPhase4Tests } from "./autonomous.phase4.test";
import { shutdown } from "../runtime/lifecycle";
import { conversionPhase3Tests } from "./conversion.phase3.test";
import { createLeadIntelligenceSnapshot } from "./crm.test.helpers";
import { revenueBrainPhase3BTests } from "./revenueBrain.phase3b.test";
import { revenueBrainPhase3CTests } from "./revenueBrain.phase3c.test";
import { queueFailClosedTests } from "./queue.failclosed.test";
import { deliveryReplayTests } from "./delivery.replay.test";
import { leadLockExpiryTests } from "./lead.lock.expiry.test";
import { schedulerLeaderTests } from "./scheduler.leader.test";
import { webhookReconciliationTests } from "./webhook.reconciliation.test";
import { consentRevokeMidflightTests } from "./consent.revoke.midflight.test";
import { cancelTokenInvalidationTests } from "./cancelToken.invalidates.test";
import { interactionNormalizerTests } from "./interactionNormalizer.test";
import { receptionClassifierTests } from "./receptionClassifier.test";
import { priorityEngineTests } from "./priorityEngine.test";
import { inboxRouterTests } from "./inboxRouter.test";
import { humanQueueTests } from "./humanQueue.test";
import { slaPolicyTests } from "./slaPolicy.test";
import { receptionMemoryTests } from "./receptionMemory.test";
import { inboundIdempotencyTests } from "./inbound.idempotency.test";
import { normalizeReplayTests } from "./normalize.replay.test";
import { classificationReplayTests } from "./classification.replay.test";
import { routingAuthorityTests } from "./routing.authority.test";
import { spamFailClosedTests } from "./spam.failclosed.test";
import { humanAssignmentIdempotentTests } from "./human.assignment.idempotent.test";
import { revenueBridgeTests } from "./revenue.bridge.test";
import { slaWarningTests } from "./sla.warning.test";
import { slaBreachTests } from "./sla.breach.test";
import { resolutionReopenTests } from "./resolution.reopen.test";
import { controlAuthorityForceHumanTests } from "./controlAuthority.forceHuman.test";
import { dashboardProjectionTests } from "./dashboardProjection.test";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const tests: TestCase[] = [
  {
    name: "memory collapse keeps newest fact",
    run: () => {
      const facts = collapseMemoryFacts([
        {
          id: "older",
          key: "budget",
          value: "2000",
          confidence: 0.6,
          createdAt: "2026-03-01T00:00:00.000Z",
          lastObservedAt: "2026-03-01T00:00:00.000Z",
        },
        {
          id: "newer",
          key: "budget",
          value: "3500",
          confidence: 0.78,
          createdAt: "2026-04-20T00:00:00.000Z",
          lastObservedAt: "2026-04-20T00:00:00.000Z",
        },
      ]);

      assert.equal(facts.length, 1);
      assert.equal(facts[0].id, "newer");
      assert.equal(facts[0].value, "3500");
    },
  },
  {
    name: "memory selection prefers fresh matching facts",
    run: () => {
      const facts = selectRelevantMemoryFacts({
        inputs: [
          {
            id: "service",
            key: "service",
            value: "website redesign",
            confidence: 0.82,
            createdAt: "2026-04-20T00:00:00.000Z",
            lastObservedAt: "2026-04-20T00:00:00.000Z",
          },
          {
            id: "old-note",
            key: "timeline",
            value: "next month",
            confidence: 0.3,
            createdAt: "2025-11-01T00:00:00.000Z",
            lastObservedAt: "2025-11-01T00:00:00.000Z",
          },
        ],
        message: "I want help with website redesign pricing",
        now: new Date("2026-04-25T00:00:00.000Z"),
      });

      assert.equal(facts[0].key, "service");
      assert.equal(facts[0].value, "website redesign");
      assert.equal(facts.some((fact) => fact.id === "old-note"), false);
    },
  },
  {
    name: "memory decay marks stale facts",
    run: () => {
      const decay = computeMemoryDecay({
        confidence: 0.4,
        lastObservedAt: "2025-12-01T00:00:00.000Z",
        now: new Date("2026-04-25T00:00:00.000Z"),
      });

      assert.equal(decay.stale, true);
      assert.ok(decay.decayedConfidence < 0.2);
    },
  },
  {
    name: "state machine advances stepwise under strong booking intent",
    run: () => {
      const result = resolveDeterministicRevenueState({
        currentState: "COLD",
        intent: "BOOKING",
        temperature: "HOT",
        userSignal: "yes",
      });

      assert.equal(result.currentState, "COLD");
      assert.equal(result.nextState, "WARM");
      assert.match(result.transitionReason, /stepped_from_cold_to_warm/);
    },
  },
  {
    name: "state machine blocks AI replies during human takeover",
    run: () => {
      const result = resolveDeterministicRevenueState({
        currentState: "WARM",
        intent: "GENERAL",
        isHumanActive: true,
      });

      assert.equal(result.nextState, "WARM");
      assert.equal(result.shouldReply, false);
      assert.equal(result.transitionReason, "human_takeover_active");
    },
  },
  {
    name: "state machine keeps converted leads terminal",
    run: () => {
      const result = resolveDeterministicRevenueState({
        currentState: "CONVERTED",
        intent: "BOOKING",
        temperature: "HOT",
      });

      assert.equal(result.nextState, "CONVERTED");
      assert.equal(result.transitionReason, "terminal:converted");
    },
  },
  {
    name: "tool plan builds sales phases in one plan",
    run: () => {
      const plan = buildRevenueBrainToolPlan({
        decision: {
          route: "SALES",
          salesDecision: null,
          conversion: null,
          reasoning: ["sales_action:ENGAGE"],
          couponRequested: true,
          toolPlan: [],
        },
        route: "SALES",
        hasReply: true,
      });

      assert.deepEqual(
        plan.map((item) => `${item.phase}:${item.name}`),
        ["before_reply:coupon", "after_reply:crm", "deferred:followup"]
      );
    },
  },
  {
    name: "tool plan keeps booking work before reply",
    run: () => {
      const plan = buildRevenueBrainToolPlan({
        decision: {
          route: "BOOKING",
          salesDecision: null,
          conversion: null,
          reasoning: ["booking_route_selected"],
          couponRequested: false,
          toolPlan: [],
        },
        route: "BOOKING",
        hasReply: true,
      });

      assert.deepEqual(
        plan.map((item) => `${item.phase}:${item.name}`),
        ["before_reply:booking", "after_reply:crm", "deferred:followup"]
      );
    },
  },
  {
    name: "tool plan does not schedule post-reply work for no-reply route",
    run: () => {
      const plan = buildRevenueBrainToolPlan({
        decision: {
          route: "NO_REPLY",
          salesDecision: null,
          conversion: null,
          reasoning: ["human_takeover_active"],
          couponRequested: false,
          toolPlan: [],
        },
        route: "NO_REPLY",
        hasReply: false,
      });

      assert.equal(plan.length, 0);
    },
  },
  {
    name: "crm intelligence scoring stays deterministic for booking-ready leads",
    run: () => {
      const snapshot = createLeadIntelligenceSnapshot();
      const profile = buildLeadIntelligenceFromSnapshot(snapshot, {
        source: "TEST",
      });

      assert.equal(profile.lifecycle.stage, "OPPORTUNITY");
      assert.equal(profile.behavior.predictedBehavior, "BOOKING_READY");
      assert.equal(profile.segments.primarySegment, "booking_ready");
      assert.equal(profile.value.valueTier, "STRATEGIC");
      assert.equal(profile.scorecard.engagementScore, 73);
      assert.equal(profile.scorecard.qualificationScore, 100);
      assert.equal(profile.scorecard.buyingIntentScore, 100);
      assert.equal(profile.scorecard.compositeScore, 100);
    },
  },
  {
    name: "crm booking lifecycle stays separate from conversion lifecycle",
    run: () => {
      const snapshot = createLeadIntelligenceSnapshot({
        lead: {
          stage: "BOOKED_CALL",
          lastBookedAt: new Date("2026-04-26T11:50:00.000Z"),
          lastConvertedAt: null,
        } as any,
        conversions: [
          {
            outcome: "booked_call",
            value: 5,
            occurredAt: new Date("2026-04-26T11:50:00.000Z"),
            source: "TEST",
            metadata: {},
          },
        ],
        conversionStats: {
          total: 1,
          openedCount: 0,
          clickedCount: 0,
          bookedCount: 1,
          paymentCount: 0,
          repliedCount: 0,
          lastConversionAt: new Date("2026-04-26T11:50:00.000Z"),
          totalValue: 5,
        },
        appointments: [
          {
            id: "appt_1",
            status: "CONFIRMED",
            startTime: new Date("2026-04-27T10:00:00.000Z"),
            endTime: new Date("2026-04-27T10:30:00.000Z"),
          },
        ],
        appointmentStats: {
          total: 1,
          upcomingCount: 1,
          completedCount: 0,
          nextAppointmentAt: new Date("2026-04-27T10:00:00.000Z"),
        },
      });
      const profile = buildLeadIntelligenceFromSnapshot(snapshot, {
        source: "TEST",
      });

      assert.equal(profile.stateGraph.booking.state, "SCHEDULED");
      assert.equal(profile.stateGraph.conversion.state, "BOOKED");
      assert.equal(profile.stateGraph.commercial.state, "HOT");
      assert.equal(profile.lifecycle.stage, "BOOKED");
      assert.equal(profile.stateGraph.conversion.lastConvertedAt, null);
    },
  },
  {
    name: "crm lifecycle marks stale followup-heavy leads as at risk",
    run: () => {
      const snapshot = createLeadIntelligenceSnapshot({
        lead: {
          followupCount: 2,
          lastMessageAt: new Date("2026-04-10T09:00:00.000Z"),
          lastEngagedAt: new Date("2026-04-10T09:00:00.000Z"),
          lastClickedAt: null,
        } as any,
        messageStats: {
          total: 2,
          userCount: 1,
          aiCount: 1,
          latestUserMessage: "Will think later.",
          latestAIMessage: "Happy to help.",
          latestUserMessageAt: new Date("2026-04-10T09:00:00.000Z"),
          latestAIMessageAt: new Date("2026-04-10T08:00:00.000Z"),
          recentQuestionCount: 0,
        },
        salesSignals: {
          objection: "LATER",
          temperature: "WARM",
          intent: "GENERAL",
          intentCategory: "doubt",
          qualificationMissing: ["budget", "timeline"],
        } as any,
        conversions: [],
        conversionStats: {
          total: 0,
          openedCount: 0,
          clickedCount: 0,
          bookedCount: 0,
          paymentCount: 0,
          repliedCount: 0,
          lastConversionAt: null,
          totalValue: 0,
        },
        followups: {
          schedule: [],
          currentAction: "schedule",
        },
        analytics: {
          aiReplyCount: 1,
          followupMessageCount: 2,
          lastTrackedReplyAt: new Date("2026-04-10T08:00:00.000Z"),
        },
      });
      const graph = buildCustomerGraph(snapshot);
      const lifecycle = assessLeadLifecycle(snapshot, graph, {
        engagementScore: 22,
        qualificationScore: 36,
        buyingIntentScore: 28,
      });

      assert.equal(lifecycle.stage, "AT_RISK");
      assert.equal(lifecycle.status, "RECOVERY");
      assert.equal(lifecycle.nextLeadStage, "INTERESTED");
      assert.equal(lifecycle.stale, true);
    },
  },
  {
    name: "crm behavior and value model prioritize retention for risky high-value leads",
    run: () => {
      const snapshot = createLeadIntelligenceSnapshot({
        lead: {
          followupCount: 2,
          lastMessageAt: new Date("2026-04-17T09:00:00.000Z"),
          lastEngagedAt: new Date("2026-04-17T09:00:00.000Z"),
        } as any,
        salesSignals: {
          objection: "LATER",
          intent: "PRICING",
          intentCategory: "doubt",
          temperature: "WARM",
        } as any,
        followups: {
          schedule: [],
          currentAction: "schedule",
        },
        messageStats: {
          total: 3,
          userCount: 1,
          aiCount: 2,
          latestUserMessage: "Will think and maybe come back later.",
          latestAIMessage: "Want me to hold a slot?",
          latestUserMessageAt: new Date("2026-04-17T09:00:00.000Z"),
          latestAIMessageAt: new Date("2026-04-17T08:00:00.000Z"),
          recentQuestionCount: 0,
        },
        conversions: [],
        conversionStats: {
          total: 0,
          openedCount: 0,
          clickedCount: 0,
          bookedCount: 0,
          paymentCount: 0,
          repliedCount: 0,
          lastConversionAt: null,
          totalValue: 0,
        },
        analytics: {
          aiReplyCount: 2,
          followupMessageCount: 2,
          lastTrackedReplyAt: new Date("2026-04-17T08:00:00.000Z"),
        },
      });
      const graph = buildCustomerGraph(snapshot);
      const seeds = {
        engagementScore: 38,
        qualificationScore: 74,
        buyingIntentScore: 64,
      };
      const lifecycle = assessLeadLifecycle(snapshot, graph, seeds);
      const relationships = mapLeadRelationships(snapshot, graph, lifecycle, seeds);
      const behavior = predictLeadBehavior(
        snapshot,
        graph,
        lifecycle,
        relationships,
        seeds
      );
      const value = predictLeadValue(
        snapshot,
        graph,
        lifecycle,
        behavior,
        relationships,
        seeds
      );

      assert.equal(lifecycle.stage, "AT_RISK");
      assert.equal(behavior.predictedBehavior, "CHURNING");
      assert.equal(behavior.nextBestAction, "TRIGGER_RETENTION_FOLLOWUP");
      assert.equal(value.valueTier, "HIGH");
      assert.equal(value.churnRisk, "HIGH");
      assert.ok(value.valueScore >= 60);
    },
  },
  {
    name: "crm relationship map keeps graph edges and analytics connections",
    run: () => {
      const snapshot = createLeadIntelligenceSnapshot({
        relatedLeads: [
          {
            id: "lead_2",
            name: "Aarav Duplicate",
            email: null,
            phone: "+919999999999",
            instagramId: null,
            platform: "WHATSAPP",
          },
        ],
      });
      const graph = buildCustomerGraph(snapshot);
      const relationships = mapLeadRelationships(
        snapshot,
        graph,
        {
          stage: "OPPORTUNITY",
          status: "ACTIVE",
          score: 84,
          nextLeadStage: "READY_TO_BUY",
          nextRevenueState: "HOT",
          nextAIStage: "HOT",
          reason: "stage:opportunity",
          daysSinceLastTouch: 0,
          stale: false,
          lastLifecycleAt: snapshot.now,
        },
        {
          engagementScore: 66,
          qualificationScore: 82,
          buyingIntentScore: 100,
        }
      );

      assert.equal(relationships.health, "STRONG");
      assert.ok(relationships.edgeCount >= 6);
      assert.equal(relationships.strongestEdge?.targetType, "BUSINESS");
      assert.ok(
        relationships.edges.some((edge) => edge.targetType === "PEER_LEAD")
      );
      assert.ok(
        relationships.edges.some((edge) => edge.targetType === "ANALYTICS")
      );
    },
  },
  {
    name: "crm persisted relationship hydration restores company trust and referral edges",
    run: () => {
      const hydrated =
        __crmIntelligenceTestInternals.hydratePersistedLeadIntelligenceProfile({
          businessId: "business_1",
          leadId: "lead_1",
          profileRecord: {
            intelligenceVersion: "phase2b",
            clientId: "client_1",
            profileCompleteness: 80,
            identityConfidence: 82,
            lifecycleStage: "OPPORTUNITY",
            lifecycleStatus: "ACTIVE",
            lifecycleScore: 84,
            engagementScore: 66,
            qualificationScore: 82,
            buyingIntentScore: 88,
            behaviorScore: 80,
            valueScore: 74,
            churnScore: 24,
            relationshipScore: 90,
            compositeScore: 86,
            predictedBehavior: "BOOKING_READY",
            nextBestAction: "SEND_BOOKING_LINK",
            valueTier: "HIGH",
            churnRisk: "LOW",
            primarySegment: "booking_ready",
            segmentKeys: ["booking_ready", "company_attached"],
            relationshipSummary: "strong map",
            enrichment: {
              resolvedNeed: "website redesign",
              resolvedBudget: "5000",
              resolvedTimeline: "this week",
              memoryHighlights: ["service:website redesign"],
              lastTouchAt: "2026-04-26T11:40:00.000Z",
              firstSeenAt: "2026-04-20T08:00:00.000Z",
            },
            metrics: {
              graph: {
                nodes: [],
                connectedSystems: ["crm", "booking"],
                graphHealth: 82,
                stats: {
                  messageCount: 3,
                  memoryFactCount: 3,
                  conversionCount: 1,
                  followupCount: 0,
                  appointmentCount: 1,
                  relatedLeadCount: 1,
                },
                enrichment: true,
              },
              stateGraph: {
                conversation: {
                  mode: "BOOKING_ACTIVE",
                  stateName: "BOOKING_CONFIRMATION",
                  reason: "persisted",
                },
                commercial: {
                  state: "HOT",
                  reason: "persisted",
                },
                booking: {
                  state: "SCHEDULED",
                  reason: "persisted",
                  lastBookedAt: "2026-04-26T11:50:00.000Z",
                  nextAppointmentAt: "2026-04-27T10:00:00.000Z",
                  hasBookingHistory: true,
                },
                conversion: {
                  state: "BOOKED",
                  reason: "persisted",
                  lastConvertedAt: null,
                },
                lifecycle: {
                  stage: "BOOKED",
                  status: "ACTIVE",
                  reason: "persisted",
                  stale: false,
                  daysSinceLastTouch: 0,
                },
                consistency: {
                  isConsistent: true,
                  issues: [],
                },
              },
              secondarySegment: "company_attached",
              segmentReason: "booking_signal_cluster",
              compute: {
                cacheStatus: "HIT",
                cacheSource: "PERSISTED",
                recomputedDimensions: [],
                dimensionHashes: {
                  graph: "g1",
                },
                ttlExpiresAt: "2026-04-26T13:00:00.000Z",
              },
            },
            behavior: {
              predictedBehavior: "BOOKING_READY",
              nextBestAction: "SEND_BOOKING_LINK",
              responseLikelihood: 72,
              bookingLikelihood: 90,
              purchaseLikelihood: 68,
              churnLikelihood: 18,
              urgency: "HIGH",
              followupIntensity: "pause",
              reason: "persisted",
            },
            valueModel: {
              projectedValue: 5000,
              expansionLikelihood: 66,
              reason: "persisted",
            },
            lifecycle: {
              nextLeadStage: "BOOKED_CALL",
              nextRevenueState: "HOT",
              nextAIStage: "HOT",
              reason: "persisted",
            },
            lastLifecycleAt: "2026-04-26T12:00:00.000Z",
            updatedAt: "2026-04-26T12:00:00.000Z",
          } as any,
          relationshipRows: [
            {
              targetType: "COMPANY",
              targetId: "business_1:profile",
              targetLabel: "Automexia",
              relationshipType: "COMPANY_CONTEXT",
              strength: 86,
              score: 86,
              metadata: {},
              lastObservedAt: "2026-04-26T11:40:00.000Z",
            },
            {
              targetType: "TRUST",
              targetId: "proof_request",
              targetLabel: "Trust proof requested",
              relationshipType: "TRUST_SIGNAL",
              strength: 78,
              score: 78,
              metadata: {},
              lastObservedAt: "2026-04-26T11:40:00.000Z",
            },
            {
              targetType: "REFERRAL",
              targetId: "network:lead_1",
              targetLabel: "Referral network",
              relationshipType: "REFERRAL_SIGNAL",
              strength: 70,
              score: 70,
              metadata: {},
              lastObservedAt: "2026-04-26T11:40:00.000Z",
            },
          ] as any,
        });

      assert.ok(hydrated);
      assert.ok(
        hydrated!.relationships.edges.some((edge) => edge.targetType === "COMPANY")
      );
      assert.ok(
        hydrated!.relationships.edges.some((edge) => edge.targetType === "TRUST")
      );
      assert.ok(
        hydrated!.relationships.edges.some((edge) => edge.targetType === "REFERRAL")
      );
      assert.equal(hydrated!.stateGraph.booking.state, "SCHEDULED");
    },
  },
  {
    name: "crm unified state stays consistent for booked non-converted leads",
    run: () => {
      const snapshot = createLeadIntelligenceSnapshot({
        lead: {
          stage: "BOOKED_CALL",
          revenueState: "HOT",
          lastBookedAt: new Date("2026-04-26T11:50:00.000Z"),
          lastConvertedAt: null,
        } as any,
        appointments: [
          {
            id: "appt_1",
            status: "CONFIRMED",
            startTime: new Date("2026-04-27T10:00:00.000Z"),
            endTime: new Date("2026-04-27T10:30:00.000Z"),
          },
        ],
        appointmentStats: {
          total: 1,
          upcomingCount: 1,
          completedCount: 0,
          nextAppointmentAt: new Date("2026-04-27T10:00:00.000Z"),
        },
      });
      const profile = buildLeadIntelligenceFromSnapshot(snapshot, {
        source: "TEST",
      });

      assert.equal(profile.stateGraph.lifecycle.stage, "BOOKED");
      assert.equal(profile.stateGraph.commercial.state, "HOT");
      assert.equal(profile.stateGraph.conversion.state, "BOOKED");
      assert.equal(profile.stateGraph.conversation.mode, "BOOKING_ACTIVE");
      assert.equal(profile.stateGraph.consistency.isConsistent, true);
    },
  },
  {
    name: "slot lock metadata stays token scoped for the same lead",
    run: () => {
      const first = __slotLockTestInternals.parseSlotLockMetadata(
        __slotLockTestInternals.encodeSlotLockMetadata({
          token: "token_old",
          leadId: "lead_1",
        })
      );
      const second = __slotLockTestInternals.parseSlotLockMetadata(
        __slotLockTestInternals.encodeSlotLockMetadata({
          token: "token_new",
          leadId: "lead_1",
        })
      );

      assert.ok(first);
      assert.ok(second);
      assert.equal(first!.leadId, "lead_1");
      assert.equal(second!.leadId, "lead_1");
      assert.notEqual(first!.token, second!.token);
    },
  },
  {
    name: "crm dirty refresh loop drains to the latest requested version under races",
    run: async () => {
      const state: any = {
        requestedVersion: 1,
        processingVersion: 0,
        completedVersion: 0,
        latestRequest: {
          businessId: "business_1",
          leadId: "lead_1",
          inputMessage: "first",
          source: "TEST",
        },
        lastError: null,
        updatedAt: "2026-04-26T12:00:00.000Z",
      };
      const processed: Array<{ version: number; inputMessage: string | null }> = [];

      const result = await runDirtyRefreshLoop({
        key: "business_1:lead_1",
        adapter: {
          readState: async () => ({ ...state }),
          markProcessing: async (_key, version) => {
            state.processingVersion = version;
          },
          markCompleted: async (_key, version) => {
            state.completedVersion = version;
            state.processingVersion = version;
          },
          markFailed: async (_key, version, error) => {
            state.processingVersion = version;
            state.lastError = error;
          },
          processRequest: async (request, version) => {
            processed.push({
              version,
              inputMessage: request.inputMessage || null,
            });

            if (version === 1) {
              state.requestedVersion = 3;
              state.latestRequest = {
                ...request,
                inputMessage: "third",
              };
            }
          },
        },
      });

      assert.deepEqual(result.processedVersions, [1, 3]);
      assert.equal(result.finalCompletedVersion, 3);
      assert.deepEqual(processed, [
        { version: 1, inputMessage: "first" },
        { version: 3, inputMessage: "third" },
      ]);
    },
  },
  {
    name: "crm refresh queue coalesces duplicate refresh bursts",
    run: async () => {
      let executions = 0;
      const queue = createDebouncedRefreshQueue<
        { key: string; payload: string },
        { key: string; payload: string; executions: number }
      >({
        keyOf: (input) => input.key,
        merge: (_current, next) => next,
        execute: async (input) => {
          executions += 1;
          return {
            ...input,
            executions,
          };
        },
        debounceMs: 20,
        ttlMs: 200,
      });

      const results = await Promise.all([
        queue.request({ key: "lead_1", payload: "first" }, { force: true }),
        queue.request({ key: "lead_1", payload: "second" }, { force: true }),
        queue.request({ key: "lead_1", payload: "third" }, { force: true }),
      ]);

      assert.equal(executions, 1);
      assert.equal(results[0].payload, "third");
      assert.equal(results[1].executions, 1);

      const cached = await queue.request({ key: "lead_1", payload: "ignored" });

      assert.equal(executions, 1);
      assert.equal(cached.executions, 1);
      queue.reset();
    },
  },
  ...conversionPhase3Tests,
  ...queueFailClosedTests,
  ...deliveryReplayTests,
  ...leadLockExpiryTests,
  ...schedulerLeaderTests,
  ...webhookReconciliationTests,
  ...consentRevokeMidflightTests,
  ...cancelTokenInvalidationTests,
  ...interactionNormalizerTests,
  ...receptionClassifierTests,
  ...priorityEngineTests,
  ...inboxRouterTests,
  ...humanQueueTests,
  ...slaPolicyTests,
  ...receptionMemoryTests,
  ...inboundIdempotencyTests,
  ...normalizeReplayTests,
  ...classificationReplayTests,
  ...routingAuthorityTests,
  ...spamFailClosedTests,
  ...humanAssignmentIdempotentTests,
  ...revenueBridgeTests,
  ...slaWarningTests,
  ...slaBreachTests,
  ...resolutionReopenTests,
  ...controlAuthorityForceHumanTests,
  ...dashboardProjectionTests,
  ...autonomousPhase4Tests,
  ...revenueBrainPhase3BTests,
  ...revenueBrainPhase3CTests,
];

let failures = 0;

const run = async () => {
  try {
    for (const testCase of tests) {
      try {
        await testCase.run();
        console.log(`PASS ${testCase.name}`);
      } catch (error) {
        failures += 1;
        console.error(`FAIL ${testCase.name}`);
        console.error(error);
      }
    }
  } finally {
    await shutdown().catch(() => undefined);
  }

  if (failures > 0) {
    process.exitCode = 1;
  } else {
    console.log(`All ${tests.length} tests passed.`);
  }

  if (process.argv.includes("--explicit-exit")) {
    process.exit(process.exitCode || 0);
  }
};

void run();
