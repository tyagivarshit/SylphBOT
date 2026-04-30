import { toRecord } from "./reception.shared";

export type CalendarConflictResolutionSource =
  | "MANUAL_OVERRIDE"
  | "OWNERSHIP_POLICY"
  | "LATEST_VERSION"
  | "POLICY_PRIORITY";

export type CalendarConflictWinner = "INTERNAL" | "EXTERNAL";

export type CalendarConflictResolution = {
  winner: CalendarConflictWinner;
  reason: string;
  source: CalendarConflictResolutionSource;
  internalVersionScore: number;
  externalVersionScore: number;
  resolutionKey: string;
};

const toVersionScore = (value: unknown) => {
  const asNumber = Number(value);

  if (Number.isFinite(asNumber) && asNumber > 0) {
    return asNumber;
  }

  const asDate = new Date(String(value || ""));

  if (!Number.isNaN(asDate.getTime())) {
    return asDate.getTime();
  }

  if (typeof value === "string" && value.trim()) {
    let score = 0;

    for (const char of value.trim()) {
      score = score * 31 + char.charCodeAt(0);
    }

    return Math.abs(score);
  }

  return 0;
};

export const resolveCalendarConflict = ({
  internalVersion,
  externalVersion,
  ownership,
  manualOverride,
  policyPriority,
}: {
  internalVersion: unknown;
  externalVersion: unknown;
  ownership?: unknown;
  manualOverride?: unknown;
  policyPriority?: unknown;
}): CalendarConflictResolution => {
  const normalizedManualOverride = String(manualOverride || "").trim().toUpperCase();
  const normalizedOwnership = String(ownership || "").trim().toUpperCase();
  const normalizedPolicyPriority = String(policyPriority || "")
    .trim()
    .toUpperCase();
  const internalVersionScore = toVersionScore(internalVersion);
  const externalVersionScore = toVersionScore(externalVersion);

  if (normalizedManualOverride === "INTERNAL") {
    return {
      winner: "INTERNAL",
      reason: "manual_override_internal",
      source: "MANUAL_OVERRIDE",
      internalVersionScore,
      externalVersionScore,
      resolutionKey: `manual:internal:${internalVersionScore}:${externalVersionScore}`,
    };
  }

  if (normalizedManualOverride === "EXTERNAL") {
    return {
      winner: "EXTERNAL",
      reason: "manual_override_external",
      source: "MANUAL_OVERRIDE",
      internalVersionScore,
      externalVersionScore,
      resolutionKey: `manual:external:${internalVersionScore}:${externalVersionScore}`,
    };
  }

  if (normalizedOwnership === "INTERNAL" && internalVersionScore >= externalVersionScore) {
    return {
      winner: "INTERNAL",
      reason: "ownership_internal",
      source: "OWNERSHIP_POLICY",
      internalVersionScore,
      externalVersionScore,
      resolutionKey: `owner:internal:${internalVersionScore}:${externalVersionScore}`,
    };
  }

  if (normalizedOwnership === "EXTERNAL" && externalVersionScore >= internalVersionScore) {
    return {
      winner: "EXTERNAL",
      reason: "ownership_external",
      source: "OWNERSHIP_POLICY",
      internalVersionScore,
      externalVersionScore,
      resolutionKey: `owner:external:${internalVersionScore}:${externalVersionScore}`,
    };
  }

  if (externalVersionScore > internalVersionScore) {
    return {
      winner: "EXTERNAL",
      reason: "latest_version_external",
      source: "LATEST_VERSION",
      internalVersionScore,
      externalVersionScore,
      resolutionKey: `latest:external:${internalVersionScore}:${externalVersionScore}`,
    };
  }

  if (internalVersionScore > externalVersionScore) {
    return {
      winner: "INTERNAL",
      reason: "latest_version_internal",
      source: "LATEST_VERSION",
      internalVersionScore,
      externalVersionScore,
      resolutionKey: `latest:internal:${internalVersionScore}:${externalVersionScore}`,
    };
  }

  const policyWinner =
    normalizedPolicyPriority === "EXTERNAL"
      ? "EXTERNAL"
      : normalizedPolicyPriority === "INTERNAL"
      ? "INTERNAL"
      : "INTERNAL";

  return {
    winner: policyWinner,
    reason: `policy_priority_${policyWinner.toLowerCase()}`,
    source: "POLICY_PRIORITY",
    internalVersionScore,
    externalVersionScore,
    resolutionKey: `policy:${policyWinner}:${internalVersionScore}:${externalVersionScore}`,
  };
};

export const resolveConflictInputFromMetadata = (metadata: unknown) => {
  const record = toRecord(metadata);

  return {
    ownership: record.syncOwnership || record.ownership || null,
    manualOverride: record.manualOverride || record.calendarManualOverride || null,
    policyPriority: record.policyPriority || record.calendarPolicyPriority || null,
  };
};
