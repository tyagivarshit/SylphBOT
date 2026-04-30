export const RELIABILITY_PHASE_VERSION = "phase6a.v1";

export const STRUCTURED_LOG_KEYS = [
  "traceId",
  "correlationId",
  "tenantId",
  "leadId",
  "interactionId",
  "appointmentId",
  "proposalId",
  "contractId",
  "paymentId",
  "queueJobId",
  "workerId",
  "provider",
  "severity",
  "component",
  "phase",
  "version",
] as const;

export type StructuredLogKey = (typeof STRUCTURED_LOG_KEYS)[number];

export type StructuredLogBindings = Record<StructuredLogKey, string | null>;

export const createStructuredLogDefaults = (
  severity: string
): StructuredLogBindings => ({
  traceId: null,
  correlationId: null,
  tenantId: null,
  leadId: null,
  interactionId: null,
  appointmentId: null,
  proposalId: null,
  contractId: null,
  paymentId: null,
  queueJobId: null,
  workerId: null,
  provider: null,
  severity: String(severity || "info").trim().toLowerCase() || "info",
  component: "runtime",
  phase: "operations",
  version: RELIABILITY_PHASE_VERSION,
});
