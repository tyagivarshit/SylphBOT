import type { SalesCTA, SalesStructuredOutput } from "../salesAgent/types";
import type {
  RevenueBrainInput,
  RevenueBrainResponsePayload,
  RevenueBrainSource,
} from "./types";

const RESPONSE_INTENTS = new Set([
  "price",
  "info",
  "booking",
  "support",
  "other",
]);

const RESPONSE_STAGES = new Set([
  "DISCOVERY",
  "QUALIFIED",
  "PITCH",
  "OBJECTION",
  "BOOKING",
  "CLOSED",
]);

const RESPONSE_LEAD_TYPES = new Set(["LOW", "MEDIUM", "HIGH"]);
const RESPONSE_CTAS = new Set(["book", "ask_more", "none"]);

const SOURCE_VALUES = new Set<RevenueBrainSource>([
  "QUEUE",
  "PREVIEW",
  "API",
  "FOLLOWUP",
  "MANUAL",
  "AUTONOMOUS",
  "LEGACY_COMPAT",
]);

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const asRecord = (
  value: unknown
): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

export const parseStrictJson = (raw: string) => {
  const text = String(raw || "").trim();

  if (!text) {
    return null;
  }

  const fenced = text.match(/```json\s*([\s\S]+?)```/i);
  const body = fenced?.[1]?.trim() || text.match(/\{[\s\S]+\}/)?.[0] || text;

  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};

const normalizeSource = (
  value?: RevenueBrainInput["source"],
  preview?: boolean
): RevenueBrainSource => {
  if (preview) {
    return "PREVIEW";
  }

  const normalized = String(value || "")
    .trim()
    .toUpperCase();

  return SOURCE_VALUES.has(normalized as RevenueBrainSource)
    ? (normalized as RevenueBrainSource)
    : "QUEUE";
};

export const validateRevenueBrainInput = (
  input: RevenueBrainInput
): RevenueBrainInput => {
  const businessId = String(input?.businessId || "").trim();
  const leadId = String(input?.leadId || "").trim();
  const message = String(input?.message || "").trim();

  if (!businessId) {
    throw new Error("Revenue brain requires businessId");
  }

  if (!leadId) {
    throw new Error("Revenue brain requires leadId");
  }

  return {
    ...input,
    businessId,
    leadId,
    message,
    traceId: String(input?.traceId || "").trim() || undefined,
    source: normalizeSource(input?.source, Boolean(input?.preview)),
    preview: Boolean(input?.preview),
  };
};

export const buildResponsePayload = ({
  message,
  intent = "info",
  stage = "DISCOVERY",
  leadType = "LOW",
  cta = "ask_more",
  confidence = 0.4,
  reason = "fallback_response",
}: Partial<RevenueBrainResponsePayload> & {
  message: string;
}): RevenueBrainResponsePayload => ({
  message: String(message || "").trim(),
  intent: RESPONSE_INTENTS.has(String(intent || "")) 
    ? (intent as RevenueBrainResponsePayload["intent"])
    : "info",
  stage: RESPONSE_STAGES.has(String(stage || ""))
    ? (stage as RevenueBrainResponsePayload["stage"])
    : "DISCOVERY",
  leadType: RESPONSE_LEAD_TYPES.has(String(leadType || ""))
    ? (leadType as RevenueBrainResponsePayload["leadType"])
    : "LOW",
  cta: RESPONSE_CTAS.has(String(cta || ""))
    ? (cta as RevenueBrainResponsePayload["cta"])
    : "ask_more",
  confidence: clamp(Number(confidence) || 0.4, 0, 1),
  reason: String(reason || "fallback_response").trim() || "fallback_response",
});

export const validateRevenueBrainResponsePayload = (
  value: unknown,
  fallback: RevenueBrainResponsePayload
): RevenueBrainResponsePayload => {
  const record = asRecord(value);

  if (!record) {
    return fallback;
  }

  const message = String(record.message || "").trim();

  if (!message) {
    return fallback;
  }

  return buildResponsePayload({
    message,
    intent: String(record.intent || fallback.intent).toLowerCase() as any,
    stage: String(record.stage || fallback.stage).toUpperCase() as any,
    leadType: String(record.leadType || fallback.leadType).toUpperCase() as any,
    cta: String(record.cta || fallback.cta).toLowerCase() as any,
    confidence:
      typeof record.confidence === "number"
        ? record.confidence
        : Number(record.confidence),
    reason: String(record.reason || fallback.reason),
  });
};

export const structuredOutputFromPayload = (
  payload: RevenueBrainResponsePayload
): SalesStructuredOutput => ({
  message: payload.message,
  intent: payload.intent as SalesStructuredOutput["intent"],
  stage: payload.stage as SalesStructuredOutput["stage"],
  leadType: payload.leadType as SalesStructuredOutput["leadType"],
  cta: payload.cta as SalesStructuredOutput["cta"],
  confidence: payload.confidence,
  reason: payload.reason,
});

export const responseCtaFromSalesCta = (
  cta?: SalesCTA | null
): RevenueBrainResponsePayload["cta"] => {
  if (cta === "BOOK_CALL" || cta === "BUY_NOW") {
    return "book";
  }

  if (cta === "NONE") {
    return "none";
  }

  return "ask_more";
};
