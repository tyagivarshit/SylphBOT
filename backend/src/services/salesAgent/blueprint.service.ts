import { getSalesCapabilityProfile } from "./policy.service";

const exampleFlows = {
  BASIC: [
    {
      user: "Interested. How does this work?",
      agent:
        "Depends on what you want to achieve. Want the quick version or should I send the best-fit option in DM?",
      cta: "REPLY_DM",
    },
    {
      user: "Price?",
      agent:
        "Pricing depends on the outcome you want. What are you trying to solve right now?",
      cta: "CAPTURE_LEAD",
    },
  ],
  PRO: [
    {
      user: "Looks good but I am not sure yet.",
      agent:
        "Totally fair. Usually it comes down to fit, timing, or budget. Which one is holding you back most?",
      cta: "VIEW_DEMO",
    },
    {
      user: "Too expensive.",
      agent:
        "I get that. The right option depends on the result you need, not the biggest package. Want me to show the smartest fit for your budget?",
      cta: "BOOK_CALL",
    },
  ],
  ELITE: [
    {
      user: "Can I start today?",
      agent:
        "Yes. If you want the fastest path, I can help you lock this in today. Want the booking option or the payment step?",
      cta: "BUY_NOW",
    },
    {
      user: "Send me details and available times.",
      agent:
        "Perfect. I can send the sharp overview, but the fastest move is locking a slot while availability is open. Want me to book it now?",
      cta: "BOOK_CALL",
    },
  ],
};

export const getSalesAgentBlueprint = () => ({
  architecture: {
    ingestion: [
      "Instagram and WhatsApp webhooks normalize inbound events and enqueue router jobs.",
      "BullMQ workers process messages per lead and keep delivery idempotent.",
      "The AI reply orchestrator preserves booking and automation shortcuts, then hands sales conversations to the sales-agent closer engine.",
    ],
    intelligence: [
      "Plan policy controls which sales behaviors are allowed for BASIC, PRO, and ELITE.",
      "Intelligence layer scores leads, classifies intent, detects objections, tracks qualification gaps, and resolves the lead’s client scope.",
      "Optimization layer learns which angles and CTAs produce conversions and feeds those hints back into future prompts.",
    ],
    execution: [
      "Reply engine grounds responses in client-specific business info, pricing, FAQ data, CRM memory, summaries, and knowledge-base hits, with shared business fallback.",
      "Follow-up engine schedules 1h, 24h, and 48h touches only for plans that support followups.",
      "Conversion events are logged when replies are sent and when bookings or downstream wins happen.",
    ],
  },
  backendLogic: [
    "BASIC runs engagement-first flows with lightweight qualification and lead capture CTAs.",
    "PRO unlocks multi-step qualification, objection handling, CRM-aware memory, and automated followups.",
    "ELITE adds autonomous closer behavior, booking-ready CTAs, payment-ready CTAs, and stronger urgency logic.",
  ],
  promptStructure: {
    system: [
      "Identity as Automexia AI, a high-converting closer and not a casual chatbot.",
      "Plan constraints and allowed CTAs.",
      "Lead temperature, intent, objection, and missing qualification data.",
      "Rules for discovery, qualification, objection handling, and conversion-first behavior.",
    ],
    grounding: [
      "Business info, pricing, FAQ knowledge, and custom sales instructions at client scope first, then shared scope.",
      "CRM memory, conversation summary, and recent chat turns.",
      "Knowledge-base hits and optimization hints from prior conversions.",
    ],
    output: {
      format: "JSON",
      fields: [
        "message",
        "intent",
        "stage",
        "leadType",
        "cta",
        "confidence",
        "reason",
      ],
    },
  },
  integrationApi: {
    instagram: {
      inboundWebhook: {
        path: "/api/webhook/instagram",
        events: ["messages", "comments"],
        normalizedPayload: {
          businessId: "string",
          leadId: "string",
          message: "string",
          platform: "INSTAGRAM",
          senderId: "string",
          pageId: "string",
          externalEventId: "string",
        },
      },
      outboundDm: {
        endpoint: "POST https://graph.facebook.com/v19.0/me/messages",
        payload: {
          recipient: { id: "instagram_user_id" },
          message: { text: "sales reply" },
        },
      },
    },
    whatsapp: {
      inboundWebhook: {
        path: "/api/webhook/whatsapp",
        normalizedPayload: {
          businessId: "string",
          leadId: "string",
          message: "string",
          platform: "WHATSAPP",
          senderId: "string",
          phoneNumberId: "string",
          externalEventId: "string",
        },
      },
      outboundMessage: {
        endpoint:
          "POST https://graph.facebook.com/v19.0/{phoneNumberId}/messages",
        payload: {
          messaging_product: "whatsapp",
          to: "lead_phone",
          type: "text",
          text: { body: "sales reply" },
        },
      },
    },
    crm: {
      leadShape: {
        id: "string",
        businessId: "string",
        stage: "NEW | INTERESTED | QUALIFIED | READY_TO_BUY | WON",
        aiStage: "COLD | WARM | HOT",
        leadScore: "number",
        intent: "string",
      },
      activityEvents: [
        "SALES_AGENT_REPLY",
        "SALES_AGENT_FOLLOWUP",
        "SALES_AGENT_CONVERSION",
      ],
    },
  },
  saasDesign: {
    multiTenant: [
      "Business-scoped clients, leads, subscriptions, usage, appointments, analytics, and knowledge bases.",
      "Client-scoped training and knowledge with shared business fallback for reusable sales intelligence.",
      "Plan capability policies isolate premium behavior without branching webhook logic.",
    ],
    scalability: [
      "Queue-driven message processing for burst control.",
      "Stateless HTTP layer with workers for AI, followups, booking monitors, and learning tasks.",
      "Analytics feedback loop stores lightweight events that can later power dashboards or offline optimization jobs.",
    ],
  },
  plans: {
    BASIC: getSalesCapabilityProfile("BASIC"),
    PRO: getSalesCapabilityProfile("PRO"),
    ELITE: getSalesCapabilityProfile("ELITE"),
  },
  exampleFlows,
});
