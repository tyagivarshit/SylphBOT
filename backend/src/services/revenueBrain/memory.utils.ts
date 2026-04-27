type MemoryFactInput = {
  id?: string | null;
  key?: string | null;
  value?: string | null;
  confidence?: number | null;
  source?: string | null;
  lastObservedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export type RevenueBrainMemoryFact = {
  id?: string | null;
  key: string;
  value: string;
  confidence: number;
  decayedConfidence: number;
  stale: boolean;
  source: string | null;
  lastObservedAt: Date | null;
  updatedAt: Date | null;
  createdAt: Date | null;
  ageDays: number;
};

const DEFAULT_CONFIDENCE = 0.55;
const MIN_CONFIDENCE = 0.05;
const MAX_CONFIDENCE = 0.99;
const DEFAULT_HALF_LIFE_DAYS = 30;
const STALE_THRESHOLD_DAYS = 45;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizeDate = (value?: Date | string | null) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeString = (value?: string | null) => String(value || "").trim();

const comparableValue = (value?: string | null) =>
  normalizeString(value).toLowerCase();

export const clampMemoryConfidence = (value?: number | null) =>
  clamp(Number.isFinite(Number(value)) ? Number(value) : DEFAULT_CONFIDENCE, MIN_CONFIDENCE, MAX_CONFIDENCE);

export const computeMemoryDecay = ({
  confidence,
  lastObservedAt,
  now = new Date(),
  halfLifeDays = DEFAULT_HALF_LIFE_DAYS,
}: {
  confidence?: number | null;
  lastObservedAt?: Date | string | null;
  now?: Date;
  halfLifeDays?: number;
}) => {
  const baseConfidence = clampMemoryConfidence(confidence);
  const observedAt = normalizeDate(lastObservedAt);

  if (!observedAt) {
    return {
      baseConfidence,
      decayedConfidence: baseConfidence,
      ageDays: 0,
      stale: false,
    };
  }

  const ageMs = Math.max(0, now.getTime() - observedAt.getTime());
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  const decayFactor = Math.pow(0.5, ageDays / Math.max(1, halfLifeDays));
  const decayedConfidence = clamp(baseConfidence * decayFactor, MIN_CONFIDENCE, MAX_CONFIDENCE);

  return {
    baseConfidence,
    decayedConfidence,
    ageDays,
    stale: ageDays >= STALE_THRESHOLD_DAYS || decayedConfidence <= 0.2,
  };
};

export const normalizeMemoryFact = (
  input: MemoryFactInput,
  options?: {
    now?: Date;
  }
): RevenueBrainMemoryFact | null => {
  const key = normalizeString(input.key).toLowerCase();
  const value = normalizeString(input.value);

  if (!key || !value) {
    return null;
  }

  const createdAt = normalizeDate(input.createdAt);
  const updatedAt = normalizeDate(input.updatedAt);
  const lastObservedAt =
    normalizeDate(input.lastObservedAt) || updatedAt || createdAt || null;
  const decay = computeMemoryDecay({
    confidence: input.confidence,
    lastObservedAt,
    now: options?.now,
  });

  return {
    id: input.id || null,
    key,
    value,
    confidence: decay.baseConfidence,
    decayedConfidence: decay.decayedConfidence,
    stale: decay.stale,
    source: normalizeString(input.source) || null,
    lastObservedAt,
    updatedAt,
    createdAt,
    ageDays: decay.ageDays,
  };
};

export const collapseMemoryFacts = (
  inputs: MemoryFactInput[],
  options?: {
    now?: Date;
  }
) => {
  const collapsed = new Map<string, RevenueBrainMemoryFact>();

  for (const input of inputs) {
    const fact = normalizeMemoryFact(input, options);

    if (!fact) {
      continue;
    }

    const existing = collapsed.get(fact.key);

    if (!existing) {
      collapsed.set(fact.key, fact);
      continue;
    }

    const existingObservedAt =
      existing.lastObservedAt?.getTime() ||
      existing.updatedAt?.getTime() ||
      existing.createdAt?.getTime() ||
      0;
    const candidateObservedAt =
      fact.lastObservedAt?.getTime() ||
      fact.updatedAt?.getTime() ||
      fact.createdAt?.getTime() ||
      0;

    if (candidateObservedAt > existingObservedAt) {
      collapsed.set(fact.key, fact);
      continue;
    }

    if (
      candidateObservedAt === existingObservedAt &&
      fact.decayedConfidence > existing.decayedConfidence
    ) {
      collapsed.set(fact.key, fact);
    }
  }

  return Array.from(collapsed.values());
};

const textOverlapScore = (left: string, right: string) => {
  const leftTokens = comparableValue(left)
    .split(/\s+/)
    .filter(Boolean);
  const rightText = comparableValue(right);

  if (!leftTokens.length || !rightText) {
    return 0;
  }

  const matches = leftTokens.filter((token) => rightText.includes(token)).length;
  return matches / leftTokens.length;
};

const keyHeuristicScore = (key: string, message: string) => {
  const normalizedMessage = comparableValue(message);

  if (!normalizedMessage) {
    return 0;
  }

  if (normalizedMessage.includes(key)) {
    return 0.3;
  }

  if (
    key === "budget" &&
    /\b(price|pricing|cost|budget|package|plan)\b/i.test(normalizedMessage)
  ) {
    return 0.28;
  }

  if (
    key === "timeline" &&
    /\b(today|tomorrow|week|month|timeline|when|start|asap)\b/i.test(
      normalizedMessage
    )
  ) {
    return 0.28;
  }

  if (
    key === "service" &&
    /\b(service|offer|need|looking for|help|solution)\b/i.test(
      normalizedMessage
    )
  ) {
    return 0.26;
  }

  if (
    key === "name" &&
    /\b(name|called|this is|i am|i'm)\b/i.test(normalizedMessage)
  ) {
    return 0.2;
  }

  return 0;
};

export const scoreMemoryFactForMessage = (
  fact: RevenueBrainMemoryFact,
  message?: string | null
) => {
  const normalizedMessage = normalizeString(message);

  if (!normalizedMessage) {
    return fact.decayedConfidence;
  }

  const overlap = textOverlapScore(normalizedMessage, `${fact.key} ${fact.value}`);
  const keyScore = keyHeuristicScore(fact.key, normalizedMessage);
  const freshnessScore = fact.stale ? 0 : 0.08;

  return fact.decayedConfidence + overlap * 0.35 + keyScore + freshnessScore;
};

export const selectRelevantMemoryFacts = ({
  inputs,
  message,
  limit = 6,
  now = new Date(),
}: {
  inputs: MemoryFactInput[];
  message?: string | null;
  limit?: number;
  now?: Date;
}) => {
  const normalized = collapseMemoryFacts(inputs, {
    now,
  });

  return normalized
    .map((fact) => ({
      fact,
      score: scoreMemoryFactForMessage(fact, message),
    }))
    .filter((item) => item.fact.decayedConfidence >= 0.12)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const rightObservedAt =
        right.fact.lastObservedAt?.getTime() ||
        right.fact.updatedAt?.getTime() ||
        right.fact.createdAt?.getTime() ||
        0;
      const leftObservedAt =
        left.fact.lastObservedAt?.getTime() ||
        left.fact.updatedAt?.getTime() ||
        left.fact.createdAt?.getTime() ||
        0;

      return rightObservedAt - leftObservedAt;
    })
    .slice(0, Math.max(1, limit))
    .map((item) => item.fact);
};

export const areMemoryValuesEquivalent = (left?: string | null, right?: string | null) =>
  comparableValue(left) === comparableValue(right);

export const summarizeMemoryFacts = (facts: RevenueBrainMemoryFact[]) =>
  facts.map((fact) => `${fact.key}: ${fact.value}`).join("\n");
