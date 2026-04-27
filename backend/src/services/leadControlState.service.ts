import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";

export type LeadControlAuthority = {
  businessId: string;
  leadId: string;
  cancelTokenVersion: number;
  manualSuppressUntil: Date | null;
  lastManualOutboundAt: Date | null;
  lastHumanTakeoverAt: Date | null;
};

export type LeadControlGateDecision = {
  allowed: boolean;
  reason: string | null;
  state: LeadControlAuthority | null;
};

const buildAuthority = (input: {
  businessId: string;
  leadId: string;
  cancelTokenVersion?: number | null;
  manualSuppressUntil?: Date | null;
  lastManualOutboundAt?: Date | null;
  lastHumanTakeoverAt?: Date | null;
}): LeadControlAuthority => ({
  businessId: input.businessId,
  leadId: input.leadId,
  cancelTokenVersion: Number(input.cancelTokenVersion || 0),
  manualSuppressUntil: input.manualSuppressUntil || null,
  lastManualOutboundAt: input.lastManualOutboundAt || null,
  lastHumanTakeoverAt: input.lastHumanTakeoverAt || null,
});

const resolveBusinessId = async (
  leadId: string,
  businessId?: string | null
) => {
  if (businessId) {
    return businessId;
  }

  const lead = await prisma.lead.findUnique({
    where: {
      id: leadId,
    },
    select: {
      businessId: true,
    },
  });

  return lead?.businessId || null;
};

export const getLeadControlAuthority = async ({
  leadId,
  businessId,
}: {
  leadId: string;
  businessId?: string | null;
}): Promise<LeadControlAuthority | null> => {
  const state = await prisma.leadControlState.findUnique({
    where: {
      leadId,
    },
    select: {
      businessId: true,
      leadId: true,
      cancelTokenVersion: true,
      manualSuppressUntil: true,
      lastManualOutboundAt: true,
      lastHumanTakeoverAt: true,
    },
  });

  if (state) {
    return buildAuthority(state);
  }

  const resolvedBusinessId = await resolveBusinessId(leadId, businessId);

  if (!resolvedBusinessId) {
    return null;
  }

  return buildAuthority({
    businessId: resolvedBusinessId,
    leadId,
    cancelTokenVersion: 0,
  });
};

export const ensureLeadControlAuthority = async ({
  leadId,
  businessId,
}: {
  leadId: string;
  businessId?: string | null;
}) => {
  const resolvedBusinessId = await resolveBusinessId(leadId, businessId);

  if (!resolvedBusinessId) {
    throw new Error(`lead_control_business_not_found:${leadId}`);
  }

  const state = await prisma.leadControlState.upsert({
    where: {
      leadId,
    },
    update: {},
    create: {
      businessId: resolvedBusinessId,
      leadId,
    },
    select: {
      businessId: true,
      leadId: true,
      cancelTokenVersion: true,
      manualSuppressUntil: true,
      lastManualOutboundAt: true,
      lastHumanTakeoverAt: true,
    },
  });

  return buildAuthority(state);
};

export const getLeadCancelTokenVersions = async (leadIds: string[]) => {
  const uniqueLeadIds = Array.from(
    new Set(
      leadIds
        .map((leadId) => String(leadId || "").trim())
        .filter(Boolean)
    )
  );
  const versions = new Map<string, number>();

  if (!uniqueLeadIds.length) {
    return versions;
  }

  const rows = await prisma.leadControlState.findMany({
    where: {
      leadId: {
        in: uniqueLeadIds,
      },
    },
    select: {
      leadId: true,
      cancelTokenVersion: true,
    },
  });

  for (const leadId of uniqueLeadIds) {
    versions.set(leadId, 0);
  }

  for (const row of rows) {
    versions.set(row.leadId, Number(row.cancelTokenVersion || 0));
  }

  return versions;
};

export const bumpLeadCancelToken = async ({
  leadId,
  businessId,
  manualSuppressUntil,
  lastManualOutboundAt,
  lastHumanTakeoverAt,
  metadata,
}: {
  leadId: string;
  businessId?: string | null;
  manualSuppressUntil?: Date | null;
  lastManualOutboundAt?: Date | null;
  lastHumanTakeoverAt?: Date | null;
  metadata?: Record<string, unknown> | null;
}) => {
  const resolvedBusinessId = await resolveBusinessId(leadId, businessId);

  if (!resolvedBusinessId) {
    throw new Error(`lead_control_business_not_found:${leadId}`);
  }

  return prisma.leadControlState.upsert({
    where: {
      leadId,
    },
    update: {
      cancelTokenVersion: {
        increment: 1,
      },
      ...(manualSuppressUntil !== undefined
        ? {
            manualSuppressUntil,
          }
        : {}),
      ...(lastManualOutboundAt !== undefined
        ? {
            lastManualOutboundAt,
          }
        : {}),
      ...(lastHumanTakeoverAt !== undefined
        ? {
            lastHumanTakeoverAt,
          }
        : {}),
      ...(metadata !== undefined
        ? {
            metadata: metadata as Prisma.InputJsonValue,
          }
        : {}),
    },
    create: {
      businessId: resolvedBusinessId,
      leadId,
      cancelTokenVersion: 1,
      manualSuppressUntil: manualSuppressUntil || null,
      lastManualOutboundAt: lastManualOutboundAt || null,
      lastHumanTakeoverAt: lastHumanTakeoverAt || null,
      metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
    },
    select: {
      businessId: true,
      leadId: true,
      cancelTokenVersion: true,
      manualSuppressUntil: true,
      lastManualOutboundAt: true,
      lastHumanTakeoverAt: true,
    },
  }).then(buildAuthority);
};

export const markLeadHumanTakeover = async ({
  leadId,
  businessId,
  lastHumanTakeoverAt = new Date(),
}: {
  leadId: string;
  businessId?: string | null;
  lastHumanTakeoverAt?: Date;
}) =>
  ensureLeadControlAuthority({
    leadId,
    businessId,
  }).then(() =>
    prisma.leadControlState.update({
      where: {
        leadId,
      },
      data: {
        lastHumanTakeoverAt,
      },
      select: {
        businessId: true,
        leadId: true,
        cancelTokenVersion: true,
        manualSuppressUntil: true,
        lastManualOutboundAt: true,
        lastHumanTakeoverAt: true,
      },
    }).then(buildAuthority)
  );

export const evaluateLeadControlGate = async ({
  leadId,
  expectedCancelTokenVersion,
  now = new Date(),
}: {
  leadId: string;
  expectedCancelTokenVersion?: number | null;
  now?: Date;
}): Promise<LeadControlGateDecision> => {
  const state = await getLeadControlAuthority({
    leadId,
  });

  if (!state) {
    return {
      allowed: false,
      reason: "lead_control_state_not_found",
      state: null,
    };
  }

  if (
    state.manualSuppressUntil instanceof Date &&
    state.manualSuppressUntil.getTime() > now.getTime()
  ) {
    return {
      allowed: false,
      reason: "manual_suppression_active",
      state,
    };
  }

  if (expectedCancelTokenVersion === undefined || expectedCancelTokenVersion === null) {
    return state.cancelTokenVersion > 0
      ? {
          allowed: false,
          reason: "cancel_token_missing",
          state,
        }
      : {
          allowed: true,
          reason: null,
          state,
        };
  }

  if (Number(expectedCancelTokenVersion) !== state.cancelTokenVersion) {
    return {
      allowed: false,
      reason: "cancel_token_stale",
      state,
    };
  }

  return {
    allowed: true,
    reason: null,
    state,
  };
};
