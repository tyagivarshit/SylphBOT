import assert from "node:assert/strict";
import { buildExpansionOpportunity } from "../services/autonomous/expansion.service";
import { evaluateAutonomousOutreachGuardrails } from "../services/autonomous/guardrail.service";
import { buildLeadRevivalOpportunity } from "../services/autonomous/leadRevival.service";
import {
  evaluateAutonomousOpportunities,
  resolveBestAutonomousOpportunity,
} from "../services/autonomous/opportunity.service";
import { buildReferralOpportunity } from "../services/autonomous/referral.service";
import { buildRetentionOpportunity } from "../services/autonomous/retention.service";
import { buildWinbackOpportunity } from "../services/autonomous/winback.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const buildSnapshot = (overrides?: Record<string, unknown>) =>
  ({
    businessId: "business_1",
    leadId: "lead_1",
    now: new Date("2026-04-26T06:00:00.000Z"),
    business: {
      name: "Automexia",
      timezone: "UTC",
      industry: "Software",
    },
    lead: {
      id: "lead_1",
      name: "Aarav",
      platform: "INSTAGRAM",
      phone: null,
      instagramId: "ig_123",
      email: "aarav@example.com",
      stage: "INTERESTED",
      aiStage: "WARM",
      revenueState: "WARM",
      isHumanActive: false,
      followupCount: 0,
      lastFollowupAt: null,
      lastEngagedAt: new Date("2026-04-10T09:00:00.000Z"),
      lastClickedAt: new Date("2026-04-08T10:00:00.000Z"),
      lastBookedAt: null,
      lastConvertedAt: null,
      lastMessageAt: new Date("2026-04-10T09:00:00.000Z"),
      createdAt: new Date("2026-04-01T09:00:00.000Z"),
    },
    client: {
      id: "client_1",
      platform: "INSTAGRAM",
      aiTone: "human-confident",
      phoneNumberId: null,
      pageId: "page_1",
      accessTokenEncrypted: "encrypted",
    },
    profile: {
      lifecycle: {
        stage: "OPPORTUNITY",
        status: "ACTIVE",
        score: 76,
        nextLeadStage: "READY_TO_BUY",
        nextRevenueState: "HOT",
        nextAIStage: "HOT",
        reason: "test",
        daysSinceLastTouch: 16,
        stale: true,
        lastLifecycleAt: new Date("2026-04-26T06:00:00.000Z"),
      },
      behavior: {
        predictedBehavior: "BOOKING_READY",
        nextBestAction: "SEND_BOOKING_LINK",
        behaviorScore: 74,
        responseLikelihood: 62,
        bookingLikelihood: 71,
        purchaseLikelihood: 58,
        churnLikelihood: 24,
        urgency: "MEDIUM",
        followupIntensity: "normal",
        reason: "test",
      },
      value: {
        valueScore: 72,
        valueTier: "HIGH",
        churnScore: 28,
        churnRisk: "LOW",
        projectedValue: 5000,
        expansionLikelihood: 64,
        reason: "test",
      },
      relationships: {
        relationshipScore: 68,
        health: "STRONG",
        summary: "healthy relationship",
        edges: [],
        strongestEdge: null,
        edgeCount: 3,
      },
      scorecard: {
        engagementScore: 58,
        qualificationScore: 76,
        buyingIntentScore: 66,
        lifecycleScore: 74,
        behaviorScore: 72,
        valueScore: 72,
        churnScore: 28,
        relationshipScore: 68,
        compositeScore: 73,
      },
      observability: {
        connectedSystems: ["crm", "analytics"],
        generatedAt: "2026-04-26T06:00:00.000Z",
        source: "TEST",
        route: null,
        followupAction: null,
        decisionAction: null,
        compute: {
          cacheStatus: "MISS",
          cacheSource: "NONE",
          recomputedDimensions: [],
          dimensionHashes: {},
          ttlExpiresAt: "2026-04-26T06:30:00.000Z",
        },
      },
    },
    recentMessages: [
      {
        sender: "AI",
        content: "Would you like the fastest slot?",
        createdAt: new Date("2026-04-10T09:00:00.000Z"),
        metadata: {},
      },
      {
        sender: "USER",
        content: "I will think about it.",
        createdAt: new Date("2026-04-08T10:00:00.000Z"),
        metadata: {},
      },
    ],
    conversions: [
      {
        outcome: "link_clicked",
        value: 2,
        occurredAt: new Date("2026-04-08T10:00:00.000Z"),
      },
    ],
    appointments: [],
    recentCampaigns: [],
    ...(overrides || {}),
  }) as any;

export const autonomousPhase4Tests: TestCase[] = [
  {
    name: "lead revival opportunity appears for stale non-converted leads",
    run: () => {
      const snapshot = buildSnapshot();
      const candidate = buildLeadRevivalOpportunity(snapshot);

      assert.ok(candidate);
      assert.equal(candidate!.engine, "lead_revival");
      assert.ok(candidate!.score >= 50);
    },
  },
  {
    name: "winback opportunity outranks revival when prior buying intent is strong",
    run: () => {
      const snapshot = buildSnapshot({
        profile: {
          ...buildSnapshot().profile,
          scorecard: {
            ...buildSnapshot().profile.scorecard,
            buyingIntentScore: 88,
          },
        },
      });
      const winback = buildWinbackOpportunity(snapshot);

      assert.ok(winback);
      assert.equal(resolveBestAutonomousOpportunity(snapshot)?.candidate.engine, "winback");
    },
  },
  {
    name: "retention and expansion only activate for customer lifecycle leads",
    run: () => {
      const customerSnapshot = buildSnapshot({
        lead: {
          ...buildSnapshot().lead,
          stage: "BOOKED_CALL",
          lastBookedAt: new Date("2026-04-18T09:00:00.000Z"),
          lastConvertedAt: new Date("2026-04-18T09:00:00.000Z"),
        },
        conversions: [
          {
            outcome: "payment_completed",
            value: 8,
            occurredAt: new Date("2026-04-18T09:00:00.000Z"),
          },
        ],
      });

      assert.ok(buildExpansionOpportunity(customerSnapshot));

      const retentionSnapshot = buildSnapshot({
        lead: {
          ...buildSnapshot().lead,
          stage: "BOOKED_CALL",
          lastBookedAt: new Date("2026-04-18T09:00:00.000Z"),
          lastConvertedAt: new Date("2026-04-18T09:00:00.000Z"),
        },
        conversions: [
          {
            outcome: "payment_completed",
            value: 8,
            occurredAt: new Date("2026-04-18T09:00:00.000Z"),
          },
        ],
        profile: {
          ...buildSnapshot().profile,
          value: {
            ...buildSnapshot().profile.value,
            churnScore: 78,
            churnRisk: "HIGH",
          },
        },
      });

      const retention = buildRetentionOpportunity(retentionSnapshot);
      assert.ok(retention);
      assert.equal(retention!.engine, "retention");
    },
  },
  {
    name: "referral opportunity requires a healthy post-value relationship",
    run: () => {
      const negative = buildReferralOpportunity(buildSnapshot());
      assert.equal(negative, null);

      const positive = buildReferralOpportunity(
        buildSnapshot({
          lead: {
            ...buildSnapshot().lead,
            stage: "BOOKED_CALL",
            lastBookedAt: new Date("2026-04-12T09:00:00.000Z"),
            lastConvertedAt: new Date("2026-04-12T09:00:00.000Z"),
          },
          conversions: [
            {
              outcome: "payment_completed",
              value: 12,
              occurredAt: new Date("2026-04-12T09:00:00.000Z"),
            },
          ],
        })
      );

      assert.ok(positive);
      assert.equal(positive!.engine, "referral");
    },
  },
  {
    name: "ethical guardrails block outreach during quiet hours and active human takeover",
    run: () => {
      const snapshot = buildSnapshot({
        now: new Date("2026-04-26T18:00:00.000Z"),
        business: {
          ...buildSnapshot().business,
          timezone: "Asia/Kolkata",
        },
        lead: {
          ...buildSnapshot().lead,
          isHumanActive: true,
        },
      });

      const guardrail = evaluateAutonomousOutreachGuardrails({
        snapshot,
        engine: "lead_revival",
      });

      assert.equal(guardrail.allowed, false);
      assert.ok(guardrail.blockedReasons.includes("quiet_hours_active"));
      assert.ok(guardrail.blockedReasons.includes("human_takeover_active"));
    },
  },
  {
    name: "opportunity evaluation returns ranked candidates with guardrail state",
    run: () => {
      const snapshot = buildSnapshot({
        lead: {
          ...buildSnapshot().lead,
          stage: "BOOKED_CALL",
          lastBookedAt: new Date("2026-04-18T09:00:00.000Z"),
          lastConvertedAt: new Date("2026-04-18T09:00:00.000Z"),
        },
        conversions: [
          {
            outcome: "payment_completed",
            value: 12,
            occurredAt: new Date("2026-04-18T09:00:00.000Z"),
          },
        ],
        profile: {
          ...buildSnapshot().profile,
          value: {
            ...buildSnapshot().profile.value,
            churnScore: 76,
            churnRisk: "HIGH",
          },
        },
      });

      const evaluations = evaluateAutonomousOpportunities(snapshot);
      assert.ok(evaluations.length > 0);
      assert.equal(evaluations[0].candidate.engine, "retention");
      assert.equal(typeof evaluations[0].guardrail.allowed, "boolean");
    },
  },
];
