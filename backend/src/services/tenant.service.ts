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

const isLikelyMongoObjectId = (value?: string | null) =>
  /^[a-fA-F0-9]{24}$/.test(String(value || "").trim());

const selectWorkspaceById = async (
  businessId: string
): Promise<WorkspaceSnapshot | null> =>
  prisma.business.findUnique({
    where: {
      id: businessId,
    },
    select: workspaceSelect,
  });

const workspaceIdentityCache = new Map<
  string,
  {
    value: UserWorkspaceIdentity;
    expiresAt: number;
  }
>();

const getWorkspaceIdentityCache = (key: string): UserWorkspaceIdentity | null => {
  const cached = workspaceIdentityCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    workspaceIdentityCache.delete(key);
    return null;
  }
  return cached.value;
};

const setWorkspaceIdentityCache = (key: string, value: UserWorkspaceIdentity) => {
  if (workspaceIdentityCache.size >= 1000) {
    for (const [k, v] of workspaceIdentityCache.entries()) {
      if (v.expiresAt <= Date.now()) {
        workspaceIdentityCache.delete(k);
      }
    }
    if (workspaceIdentityCache.size >= 1000) {
      workspaceIdentityCache.clear();
    }
  }
  workspaceIdentityCache.set(key, {
    value,
    expiresAt: Date.now() + 10_000, // 10 seconds TTL
  });
};

export const clearWorkspaceIdentityCache = () => {
  workspaceIdentityCache.clear();
};

const createWorkspaceForUser = async (input: {
  userId: string;
  userName?: string | null;
}) => {
  const readOwnerWorkspace = async () => {
    if (!isLikelyMongoObjectId(input.userId)) {
      return null;
    }

    return prisma.business
      .findFirst({
        where: {
          ownerId: input.userId,
          deletedAt: null,
        },
        orderBy: {
          createdAt: "asc",
        },
        select: workspaceSelect,
      })
      .catch((error) => {
        const message = String((error as Error)?.message || "");
        if (/Malformed ObjectID|Inconsistent column data/i.test(message)) {
          return null;
        }
        throw error;
      });
  };

  const ensureOwnerWorkspace = async () => {
    const existingWorkspace = await readOwnerWorkspace();

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

    const createdWorkspace = await prisma.business
      .create({
        data: {
          name: buildWorkspaceName(input.userName),
          ownerId: input.userId,
        },
        select: workspaceSelect,
      })
      .catch(async (error) => {
        const message = String((error as Error)?.message || "");
        if (/Malformed ObjectID|Inconsistent column data/i.test(message)) {
          const fallback = await readOwnerWorkspace();
          if (fallback) {
            return fallback;
          }
        }

        throw error;
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
    waitMs: 1500, // Reduced from 5000 to prevent request path wait accumulation
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
  const cacheKey = `${userId}:${preferredBusinessId || "none"}`;
  const cachedResult = getWorkspaceIdentityCache(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }
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
    const res: UserWorkspaceIdentity = {
      businessId: null,
      workspace: null,
      source: "none",
    };
    setWorkspaceIdentityCache(cacheKey, res);
    return res;
  }

  const linkedWorkspace = toWorkspaceSnapshot(user.business as WorkspaceSnapshot | null);
  if (linkedWorkspace) {
    const res: UserWorkspaceIdentity = {
      businessId: linkedWorkspace.id,
      workspace: linkedWorkspace,
      source: "linked",
    };
    setWorkspaceIdentityCache(cacheKey, res);
    return res;
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

  const result: UserWorkspaceIdentity = {
    businessId: resolvedWorkspace?.id || null,
    workspace: resolvedWorkspace,
    source,
  };
  setWorkspaceIdentityCache(cacheKey, result);
  return result;
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
