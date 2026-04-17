# AI Sales Agent System

## Goal

This system turns inbound Instagram and WhatsApp conversations into conversion-focused sales flows. It is designed to behave like a closer, not a generic chatbot.

It now supports multi-client training under one owner workspace:

- shared business training for fallback intelligence
- client-specific training for each connected brand or automation client
- retrieval that prefers the lead's client scope first, then falls back to shared knowledge

## Core Flow

1. Webhooks receive inbound Instagram comments, Instagram DMs, or WhatsApp messages.
2. The message is normalized into a queue job with `businessId`, `leadId`, `platform`, and routing metadata.
3. The AI worker runs the reply orchestrator.
4. Booking and automation shortcuts are checked first.
5. General sales conversations are handled by the `salesAgent` layer.
6. The reply is saved, delivered to the platform, emitted to sockets, and logged for optimization.
7. Follow-ups are scheduled only when the current subscription plan allows them.

## Plan Intelligence

### BASIC

- Engagement and lead capture
- Short replies
- Up to one sharp qualification question
- Comment-to-DM and DM-to-link style CTAs
- No automated follow-up engine

### PRO

- Multi-step qualification
- Budget, need, and timeline discovery
- Objection handling
- CRM-aware memory
- 1h, 24h, and 48h automated follow-ups
- Demo or booking-oriented CTAs

### ELITE

- Full closer behavior
- Stronger urgency and commitment logic
- Booking-first and payment-first CTAs
- Knowledge-grounded personalization
- Conversion optimization loop using prior outcomes

## Service Modules

### `salesAgent/policy.service.ts`

Defines plan-aware capability profiles and allowed CTA behavior.

### `salesAgent/intelligence.service.ts`

Builds lead context by combining:

- lead record
- business and client training data with client-first fallback logic
- memory and conversation summary
- knowledge-base hits
- lead scoring, intent detection, objection detection, and qualification gaps

### `salesAgent/prompt.service.ts`

Builds the closer prompt and enforces short, human, CTA-driven output.

### `salesAgent/reply.service.ts`

Runs the prompt, parses the structured reply, applies fallbacks, and logs reply events.

### `salesAgent/followup.service.ts`

Creates the 1h, 24h, and 48h follow-up sequence for plans with follow-up access.

## Multi-Client Training

Training endpoints accept an optional `clientId`.

- no `clientId`: store data in the shared business brain
- with `clientId`: store data only for that client scope

This applies to:

- business info
- FAQs
- AI tone and sales instructions
- manual knowledge-base entries

At reply time, the system:

1. identifies the lead's `clientId`
2. loads that client's training data
3. searches that client's knowledge first
4. falls back to shared business training and shared knowledge

### `salesAgent/optimizer.service.ts`

Stores reply, follow-up, and conversion events in `Analytics` so future replies can lean on what converts.

## Prompt Contract

The model is instructed to return JSON only:

```json
{
  "message": "short human closer reply",
  "cta": "REPLY_DM | VIEW_DEMO | BOOK_CALL | BUY_NOW | CAPTURE_LEAD | NONE",
  "angle": "curiosity | urgency | social_proof | personalization | value",
  "reason": "why this move fits the lead"
}
```

Grounding includes:

- business info
- pricing info
- FAQ/training content
- sales instructions
- CRM memory
- conversation summary
- recent messages
- knowledge hits
- optimization hints

## Follow-up Strategy

### 1 hour

- Personal reminder
- Light nudge
- Easy CTA

### 24 hours

- Value or social proof
- Reduce friction
- Push to demo or booking

### 48 hours

- Urgency
- Final re-engagement attempt
- Close with one action

## Integration Contracts

### Instagram

- Inbound: `/api/webhook/instagram`
- Outbound: `POST https://graph.facebook.com/v19.0/me/messages`
- Supports comments to DM handoff and DM sales flows

### WhatsApp

- Inbound: `/api/webhook/whatsapp`
- Outbound: `POST https://graph.facebook.com/v19.0/{phoneNumberId}/messages`
- Supports direct sales conversations and follow-ups

### CRM

Lead records maintain:

- `stage`
- `aiStage`
- `leadScore`
- `intent`
- `clientId`

Analytics tracks:

- `SALES_AGENT_REPLY`
- `SALES_AGENT_FOLLOWUP`
- `SALES_AGENT_CONVERSION`

## SaaS Scalability

- Multi-tenant by `businessId`
- Queue-based worker execution
- Platform delivery separated from reply generation
- Billing plan decides capability access without branching the webhook layer
- Analytics events create a feedback loop for future optimization

## Inspection Endpoints

- `GET /api/ai/sales-agent/blueprint`
- `POST /api/ai/sales-agent/preview`
- `POST /api/ai/test`

The blueprint endpoint returns architecture, prompt structure, example flows, and integration API shapes.
