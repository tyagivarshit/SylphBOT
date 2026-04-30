import { Prisma } from "@prisma/client";
import { createDurableOutboxEvent } from "./eventOutbox.service";

export const COMMERCE_EVENT_CONTRACT_VERSION = 1 as const;

export const COMMERCE_EVENT_TYPES = [
  "commerce.proposal.created",
  "commerce.proposal.status_changed",
  "commerce.discount.requested",
  "commerce.discount.decided",
  "commerce.contract.generated",
  "commerce.contract.status_changed",
  "commerce.signature.requested",
  "commerce.signature.status_changed",
  "commerce.payment_intent.created",
  "commerce.payment_intent.status_changed",
  "commerce.payment_attempt.status_changed",
  "commerce.invoice.issued",
  "commerce.invoice.status_changed",
  "commerce.subscription.created",
  "commerce.subscription.status_changed",
  "commerce.renewal.processed",
  "commerce.checkout.abandoned",
  "commerce.checkout.recovered",
  "commerce.dunning.step_executed",
  "commerce.refund.review_required",
  "commerce.refund.status_changed",
  "commerce.chargeback.status_changed",
  "commerce.revenue.stage_recorded",
  "commerce.webhook.reconciled",
  "commerce.owner.feed",
] as const;

export type CommerceEventName = (typeof COMMERCE_EVENT_TYPES)[number];

export type CommerceAggregateType =
  | "proposal_ledger"
  | "contract_ledger"
  | "signature_ledger"
  | "payment_intent_ledger"
  | "payment_attempt_ledger"
  | "invoice_ledger"
  | "subscription_ledger"
  | "refund_ledger"
  | "chargeback_ledger"
  | "discount_approval_ledger"
  | "revenue_recognition_ledger"
  | "commerce_policy"
  | "pricing_catalog"
  | "commerce_flow";

export type CommerceEventEnvelope = {
  type: CommerceEventName;
  version: typeof COMMERCE_EVENT_CONTRACT_VERSION;
  aggregateType: CommerceAggregateType;
  aggregateId: string;
  dedupeKey: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export const buildCommerceEventDedupeKey = ({
  event,
  aggregateType,
  aggregateId,
  eventKey,
}: {
  event: CommerceEventName;
  aggregateType: CommerceAggregateType;
  aggregateId: string;
  eventKey?: string | null;
}) =>
  [
    "commerce",
    `v${COMMERCE_EVENT_CONTRACT_VERSION}`,
    event,
    aggregateType,
    aggregateId,
    String(eventKey || aggregateId).trim() || aggregateId,
  ].join(":");

export const publishCommerceEvent = async ({
  event,
  businessId,
  aggregateType,
  aggregateId,
  payload,
  occurredAt = new Date(),
  eventKey,
  tx,
}: {
  event: CommerceEventName;
  businessId: string;
  aggregateType: CommerceAggregateType;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt?: Date;
  eventKey?: string | null;
  tx?: Prisma.TransactionClient;
}) => {
  const dedupeKey = buildCommerceEventDedupeKey({
    event,
    aggregateType,
    aggregateId,
    eventKey,
  });
  const envelope: CommerceEventEnvelope = {
    type: event,
    version: COMMERCE_EVENT_CONTRACT_VERSION,
    aggregateType,
    aggregateId,
    dedupeKey,
    occurredAt: occurredAt.toISOString(),
    payload,
  };

  await createDurableOutboxEvent({
    businessId,
    eventType: event,
    aggregateType,
    aggregateId,
    payload: envelope,
    dedupeKey,
    tx,
  });

  return envelope;
};
