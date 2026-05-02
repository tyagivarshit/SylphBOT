import type { Request } from "express";
import prisma from "../config/prisma";
import { withDistributedLock } from "./distributedLock.service";

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
  source:
    | "linked"
    | "preferred"
    | "owner_fallback"
    | "bootstrapped"
    | "none";
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

const workspaceSelect = {
  id: true,
  name: true,
  website: true,
  industry: true,
  teamSize: true,
  type: true,
  timezone: true,
  ownerId: true,
  deletedAt: true,
} as const;

const buildWorkspaceName = (name?: string | null) => {
  const base = String(name || "").trim() || "My";
  return `${base} Workspace`;
};

const selectWorkspaceById = async (
  businessId: string
): Promise<WorkspaceSnapshot | null> =>
  prisma.business.findUnique({
    where: {
      id: businessId,
    },
    select: workspaceSelect,
  });

const createWorkspaceForUser = async (input: {
  userId: string;
  userName?: string | null;
}) => {
  const ensureOwnerWorkspace = async () => {
    const existingWorkspace = await prisma.business.findFirst({
      where: {
        ownerId: input.userId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: workspaceSelect,
    });

    if (existingWorkspace) {
      await prisma.user
        .update({
          where: {
            id: input.userId,
          },
          data: {
            businessId: existingWorkspace.id,
          },
        })
        .catch(() => undefined);

      return existingWorkspace as WorkspaceSnapshot;
    }

    const createdWorkspace = await prisma.business.create({
      data: {
        name: buildWorkspaceName(input.userName),
        ownerId: input.userId,
      },
      select: workspaceSelect,
    });

    await prisma.user
      .update({
        where: {
          id: input.userId,
        },
        data: {
          businessId: createdWorkspace.id,
        },
      })
      .catch(() => undefined);

    return createdWorkspace as WorkspaceSnapshot;
  };

  return withDistributedLock({
    key: `auth:workspace-bootstrap:${input.userId}`,
    ttlMs: 15_000,
    waitMs: 5_000,
    pollMs: 75,
    onUnavailable: ensureOwnerWorkspace,
    run: async () => ensureOwnerWorkspace(),
  });
};

export const resolveUserWorkspaceIdentity = async (input: {
  userId: string;
  preferredBusinessId?: string | null;
  persistResolvedBusinessId?: boolean;
  bootstrapWorkspaceIfMissing?: boolean;
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
      name: true,
      businessId: true,
      business: {
        select: workspaceSelect,
      },
      ownedBusinesses: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          createdAt: "asc",
        },
        take: 1,
        select: workspaceSelect,
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
    !resolvedWorkspace &&
    input.bootstrapWorkspaceIfMissing !== false
  ) {
    resolvedWorkspace = toWorkspaceSnapshot(
      await createWorkspaceForUser({
        userId,
        userName: user.name,
      })
    );
    source = resolvedWorkspace ? "bootstrapped" : "none";
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
