import type { Request } from "express";
import prisma from "../config/prisma";

type WorkspaceSnapshot = {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  teamSize: string | null;
  type: string | null;
  timezone: string | null;
  ownerId: string;
  deletedAt: Date | null;
};

type UserWorkspaceIdentity = {
  businessId: string | null;
  workspace: WorkspaceSnapshot | null;
  source: "linked" | "preferred" | "owner_fallback" | "none";
};

const normalizeBusinessId = (value?: string | null) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

const toWorkspaceSnapshot = (
  workspace: WorkspaceSnapshot | null | undefined
): WorkspaceSnapshot | null => {
  if (!workspace || workspace.deletedAt) {
    return null;
  }

  return workspace;
};

const selectWorkspaceById = async (
  businessId: string
): Promise<WorkspaceSnapshot | null> =>
  prisma.business.findUnique({
    where: {
      id: businessId,
    },
    select: {
      id: true,
      name: true,
      website: true,
      industry: true,
      teamSize: true,
      type: true,
      timezone: true,
      ownerId: true,
      deletedAt: true,
    },
  });

export const resolveUserWorkspaceIdentity = async (input: {
  userId: string;
  preferredBusinessId?: string | null;
  persistResolvedBusinessId?: boolean;
}): Promise<UserWorkspaceIdentity> => {
  const userId = String(input.userId || "").trim();

  if (!userId) {
    return {
      businessId: null,
      workspace: null,
      source: "none",
    };
  }

  const preferredBusinessId = normalizeBusinessId(input.preferredBusinessId);
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      businessId: true,
      business: {
        select: {
          id: true,
          name: true,
          website: true,
          industry: true,
          teamSize: true,
          type: true,
          timezone: true,
          ownerId: true,
          deletedAt: true,
        },
      },
      ownedBusinesses: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          createdAt: "asc",
        },
        take: 1,
        select: {
          id: true,
          name: true,
          website: true,
          industry: true,
          teamSize: true,
          type: true,
          timezone: true,
          ownerId: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!user) {
    return {
      businessId: null,
      workspace: null,
      source: "none",
    };
  }

  const linkedWorkspace = toWorkspaceSnapshot(user.business as WorkspaceSnapshot | null);
  if (linkedWorkspace) {
    return {
      businessId: linkedWorkspace.id,
      workspace: linkedWorkspace,
      source: "linked",
    };
  }

  let resolvedWorkspace: WorkspaceSnapshot | null = null;
  let source: UserWorkspaceIdentity["source"] = "none";

  if (preferredBusinessId) {
    const preferredWorkspace = toWorkspaceSnapshot(
      await selectWorkspaceById(preferredBusinessId)
    );

    if (
      preferredWorkspace &&
      (preferredWorkspace.ownerId === userId || user.businessId === preferredWorkspace.id)
    ) {
      resolvedWorkspace = preferredWorkspace;
      source = "preferred";
    }
  }

  if (!resolvedWorkspace) {
    const ownerWorkspace = toWorkspaceSnapshot(
      (user.ownedBusinesses[0] as WorkspaceSnapshot | undefined) || null
    );

    if (ownerWorkspace) {
      resolvedWorkspace = ownerWorkspace;
      source = "owner_fallback";
    }
  }

  if (
    resolvedWorkspace &&
    input.persistResolvedBusinessId !== false &&
    user.businessId !== resolvedWorkspace.id
  ) {
    await prisma.user
      .update({
        where: {
          id: userId,
        },
        data: {
          businessId: resolvedWorkspace.id,
        },
      })
      .catch(() => undefined);
  }

  return {
    businessId: resolvedWorkspace?.id || null,
    workspace: resolvedWorkspace,
    source,
  };
};

export const getRequestBusinessId = (req: Request) =>
  req.user?.businessId || req.apiKey?.businessId || req.tenant?.businessId || null;

export const getTenantFilter = <T extends Record<string, unknown>>(
  businessId: string,
  extraWhere?: T
) =>
  ({
    businessId,
    ...(extraWhere || {}),
  }) as T & { businessId: string };

export const isTenantScopedRequest = (req: Request) =>
  Boolean(getRequestBusinessId(req));

export const assertBusinessOwnership = (
  requestBusinessId: string | null,
  candidateBusinessId: string | null | undefined
) =>
  Boolean(
    requestBusinessId &&
      candidateBusinessId &&
      String(requestBusinessId) === String(candidateBusinessId)
  );
