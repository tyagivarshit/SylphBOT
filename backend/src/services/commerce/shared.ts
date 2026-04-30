import crypto from "crypto";
import {
  BillingCycle,
  ChargebackStatus,
  CommerceActor,
  CommerceProvider,
  ContractStatus,
  Currency,
  DiscountApprovalStatus,
  InvoiceLedgerStatus,
  PaymentAttemptStatus,
  PaymentIntentStatus,
  ProposalStatus,
  RefundStatus,
  RevenueRecognitionStage,
  SignatureStatus,
  SubscriptionLedgerStatus,
} from "@prisma/client";
import { stableStringify, toRecord } from "../reception.shared";

export type JsonRecord = Record<string, unknown>;

export const DEFAULT_TAX_BPS = 1800;

export const PROPOSAL_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  DRAFT: ["PENDING_APPROVAL", "APPROVED", "SENT", "CANCELLED", "EXPIRED"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "EXPIRED", "CANCELLED"],
  APPROVED: ["SENT", "ACCEPTED", "EXPIRED", "CANCELLED"],
  SENT: ["ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"],
  ACCEPTED: ["CONTRACT_GENERATED"],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
  CONTRACT_GENERATED: [],
};

export const CONTRACT_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  GENERATED: ["SENT_FOR_SIGNATURE", "SIGNED", "CANCELLED", "EXPIRED"],
  SENT_FOR_SIGNATURE: ["PARTIALLY_SIGNED", "SIGNED", "CANCELLED", "EXPIRED"],
  PARTIALLY_SIGNED: ["SIGNED", "CANCELLED", "EXPIRED"],
  SIGNED: ["ACTIVATED", "CANCELLED"],
  ACTIVATED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export const SIGNATURE_TRANSITIONS: Record<SignatureStatus, SignatureStatus[]> = {
  PENDING: ["SIGNED", "DECLINED", "REVOKED", "EXPIRED"],
  SIGNED: [],
  DECLINED: [],
  REVOKED: [],
  EXPIRED: [],
};

export const PAYMENT_INTENT_TRANSITIONS: Record<PaymentIntentStatus, PaymentIntentStatus[]> = {
  CREATED: ["REQUIRES_ACTION", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"],
  REQUIRES_ACTION: ["PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"],
  PROCESSING: ["PARTIALLY_CAPTURED", "SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"],
  PARTIALLY_CAPTURED: ["SUCCEEDED", "FAILED", "CANCELLED"],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export const PAYMENT_ATTEMPT_TRANSITIONS: Record<PaymentAttemptStatus, PaymentAttemptStatus[]> = {
  INITIATED: ["PROCESSING", "SUCCEEDED", "FAILED", "TIMEOUT", "CANCELLED"],
  PROCESSING: ["SUCCEEDED", "FAILED", "TIMEOUT", "CANCELLED"],
  SUCCEEDED: [],
  FAILED: [],
  TIMEOUT: [],
  CANCELLED: [],
};

export const INVOICE_TRANSITIONS: Record<InvoiceLedgerStatus, InvoiceLedgerStatus[]> = {
  DRAFT: ["ISSUED", "VOID"],
  ISSUED: ["PARTIALLY_PAID", "PAID", "OVERDUE", "VOID", "WRITTEN_OFF"],
  PARTIALLY_PAID: ["PAID", "OVERDUE", "REFUNDED", "WRITTEN_OFF"],
  PAID: ["REFUNDED", "WRITTEN_OFF"],
  OVERDUE: ["PARTIALLY_PAID", "PAID", "WRITTEN_OFF", "VOID"],
  VOID: [],
  WRITTEN_OFF: [],
  REFUNDED: [],
};

export const SUBSCRIPTION_TRANSITIONS: Record<
  SubscriptionLedgerStatus,
  SubscriptionLedgerStatus[]
> = {
  PENDING: ["TRIALING", "ACTIVE", "CANCELLED", "EXPIRED"],
  TRIALING: ["ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"],
  ACTIVE: ["PAST_DUE", "PAUSED", "CANCELLED", "EXPIRED"],
  PAST_DUE: ["ACTIVE", "PAUSED", "CANCELLED", "EXPIRED"],
  PAUSED: ["ACTIVE", "CANCELLED", "EXPIRED"],
  CANCELLED: [],
  EXPIRED: [],
};

export const REFUND_TRANSITIONS: Record<RefundStatus, RefundStatus[]> = {
  REQUESTED: ["APPROVED", "CANCELLED", "FAILED"],
  APPROVED: ["PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"],
  PROCESSING: ["SUCCEEDED", "FAILED", "CANCELLED"],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
};

export const CHARGEBACK_TRANSITIONS: Record<ChargebackStatus, ChargebackStatus[]> = {
  RECEIVED: ["UNDER_REVIEW", "ACCEPTED", "LOST", "WON"],
  UNDER_REVIEW: ["WON", "LOST", "ACCEPTED", "REVERSED"],
  WON: ["REVERSED"],
  LOST: ["REVERSED"],
  ACCEPTED: ["REVERSED"],
  REVERSED: [],
};

export const DISCOUNT_APPROVAL_TRANSITIONS: Record<
  DiscountApprovalStatus,
  DiscountApprovalStatus[]
> = {
  REQUESTED: ["APPROVED", "REJECTED", "EXPIRED", "CANCELLED"],
  APPROVED: [],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export const REVENUE_STAGES: RevenueRecognitionStage[] = [
  "BOOKED",
  "INVOICED",
  "COLLECTED",
  "RECOGNIZED",
  "DEFERRED",
  "REFUNDED",
  "WRITTEN_OFF",
];

export const normalizeCurrency = (value?: string | null): Currency => {
  return String(value || "INR").trim().toUpperCase() === "USD" ? "USD" : "INR";
};

export const normalizeBillingCycle = (value?: string | null): BillingCycle => {
  return String(value || "monthly").trim().toLowerCase() === "yearly"
    ? "yearly"
    : "monthly";
};

export const normalizeProvider = (value?: string | null): CommerceProvider => {
  const normalized = String(value || "INTERNAL").trim().toUpperCase();

  if (normalized === "STRIPE") return "STRIPE";
  if (normalized === "RAZORPAY") return "RAZORPAY";
  if (normalized === "PAYPAL") return "PAYPAL";

  return "INTERNAL";
};

export const normalizeActor = (value?: string | null): CommerceActor => {
  const normalized = String(value || "SYSTEM").trim().toUpperCase();

  if (normalized === "AI") return "AI";
  if (normalized === "HUMAN") return "HUMAN";
  if (normalized === "SELF") return "SELF";
  if (normalized === "WEBHOOK") return "WEBHOOK";

  return "SYSTEM";
};

export const buildLedgerKey = (prefix: string) => {
  const normalizedPrefix = String(prefix || "commerce")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_");

  return `${normalizedPrefix}_${crypto.randomUUID().replace(/-/g, "")}`;
};

export const buildDeterministicDigest = (input: unknown) =>
  crypto
    .createHash("sha256")
    .update(stableStringify(input))
    .digest("hex");

export const assertTransition = <TState extends string>({
  current,
  next,
  transitions,
  scope,
}: {
  current: TState;
  next: TState;
  transitions: Record<TState, TState[]>;
  scope: string;
}) => {
  if (current === next) {
    return;
  }

  if ((transitions[current] || []).includes(next)) {
    return;
  }

  throw new Error(`invalid_${scope}_transition:${current}->${next}`);
};

export const toMinor = (input: number) => Math.max(0, Math.round(Number(input || 0)));

export const applyTax = ({
  subtotalMinor,
  taxBps = DEFAULT_TAX_BPS,
}: {
  subtotalMinor: number;
  taxBps?: number;
}) => {
  const subtotal = toMinor(subtotalMinor);
  const rate = Math.max(0, Math.floor(Number(taxBps || 0)));
  const taxMinor = Math.round((subtotal * rate) / 10_000);

  return {
    subtotalMinor: subtotal,
    taxMinor,
    totalMinor: subtotal + taxMinor,
  };
};

export const clampPercent = (value: number) =>
  Math.max(0, Math.min(100, Math.floor(Number(value || 0))));

export const mergeMetadata = (
  existing: unknown,
  incoming?: JsonRecord | null
): JsonRecord | null => {
  const merged = {
    ...toRecord(existing),
    ...(incoming || {}),
  };

  return Object.keys(merged).length ? merged : null;
};

export const nowIso = () => new Date().toISOString();
