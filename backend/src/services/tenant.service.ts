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
): Promise<WorkspaceSnapshot | null> => {
  if (!isLikelyMongoObjectId(businessId)) {
    return {
      id: businessId,
      name: "Mock Workspace",
      website: null,
      industry: null,
      teamSize: null,
      type: null,
      timezone: "UTC",
      ownerId: "user_1",
      deletedAt: null,
    };
  }

  const tStart = Date.now();
  const res = await prisma.business.findUnique({
    where: {
      id: businessId,
    },
    select: workspaceSelect,
  });
  console.log(`[DEEP_AUDIT] business.findUnique took ${Date.now() - tStart}ms for businessId: ${businessId}`);
  return res;
};

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
  isCheckout?: boolean;
}) => {
  const readOwnerWorkspace = async () => {
    if (!isLikelyMongoObjectId(input.userId)) {
      return null;
    }

    const tStart = Date.now();
    const res = await prisma.business
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
    console.log(`[DEEP_AUDIT] readOwnerWorkspace business.findFirst took ${Date.now() - tStart}ms for userId: ${input.userId}`);
    return res;
  };

  const ensureOwnerWorkspace = async () => {
    const existingWorkspace = await readOwnerWorkspace();

    if (existingWorkspace) {
      const tUserUpdateStart = Date.now();
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
      console.log(`[DEEP_AUDIT] linkExistingWorkspace user.update took ${Date.now() - tUserUpdateStart}ms for userId: ${input.userId}`);

      return existingWorkspace as WorkspaceSnapshot;
    }

    const tBusinessCreateStart = Date.now();
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
    console.log(`[DEEP_AUDIT] createWorkspace business.create took ${Date.now() - tBusinessCreateStart}ms for userId: ${input.userId}`);

    const tUserUpdateStart = Date.now();
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
    console.log(`[DEEP_AUDIT] linkNewWorkspace user.update took ${Date.now() - tUserUpdateStart}ms for userId: ${input.userId}`);

    return createdWorkspace as WorkspaceSnapshot;
  };

  if (input.isCheckout) {
    return ensureOwnerWorkspace();
  }

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
  isCheckout?: boolean;
  user?: {
    id: string;
    name: string;
    businessId: string | null;
    business?: any;
    ownedBusinesses?: any[];
  } | null;
}): Promise<UserWorkspaceIdentity> => {
  const tStartTime = Date.now();
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

  // TASK 1: Pass already-loaded user object to remove duplicate user lookup
  let user = input.user;

  // TASK 3: JWT/Business Context Fast Path (Bypass checks if user is already linked to a workspace)
  if (user?.businessId && (!preferredBusinessId || preferredBusinessId === user.businessId)) {
    const preloadedWorkspace = user.business;
    if (preloadedWorkspace) {
      const elapsedMs = Date.now() - tStartTime;
      console.info("AUTH_IDENTITY_FASTPATH", {
        source: "jwt",
        identity_resolve_ms: elapsedMs,
      });
      return {
        businessId: user.businessId,
        workspace: toWorkspaceSnapshot(preloadedWorkspace),
        source: "linked",
      };
    }

    const workspace = await selectWorkspaceById(user.businessId);
    if (workspace) {
      const elapsedMs = Date.now() - tStartTime;
      console.info("AUTH_IDENTITY_FASTPATH", {
        source: "linked_user",
        identity_resolve_ms: elapsedMs,
      });
      return {
        businessId: user.businessId,
        workspace,
        source: "linked",
      };
    }
  }

  // If user is not passed or not loaded yet, query the database
  if (!user) {
    user = await prisma.user.findUnique({
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
  }

  if (!user) {
    const res: UserWorkspaceIdentity = {
      businessId: null,
      workspace: null,
      source: "none",
    };
    setWorkspaceIdentityCache(cacheKey, res);
    return res;
  }

  // Check fast path if we just resolved user from DB and found they are linked
  if (user.businessId && (!preferredBusinessId || preferredBusinessId === user.businessId)) {
    const preloadedWorkspace = user.business;
    if (preloadedWorkspace) {
      const elapsedMs = Date.now() - tStartTime;
      console.info("AUTH_IDENTITY_FASTPATH", {
        source: "linked_user",
        identity_resolve_ms: elapsedMs,
      });
      return {
        businessId: user.businessId,
        workspace: toWorkspaceSnapshot(preloadedWorkspace),
        source: "linked",
      };
    }
  }

  const linkedWorkspace = toWorkspaceSnapshot(user.business as WorkspaceSnapshot | null);
  if (linkedWorkspace) {
    const res: UserWorkspaceIdentity = {
      businessId: linkedWorkspace.id,
      workspace: linkedWorkspace,
      source: "linked",
    };
    setWorkspaceIdentityCache(cacheKey, res);
    const elapsedMs = Date.now() - tStartTime;
    console.info("AUTH_IDENTITY_FASTPATH", {
      source: "linked_user",
      identity_resolve_ms: elapsedMs,
    });
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
    const ownedB = user.ownedBusinesses || [];
    const ownerWorkspace = toWorkspaceSnapshot(
      (ownedB[0] as WorkspaceSnapshot | undefined) || null
    );

    if (ownerWorkspace) {
      resolvedWorkspace = ownerWorkspace;
      source = "owner_fallback";
    }
  }

  let isCreatedWorkspace = false;
  if (
    !resolvedWorkspace &&
    input.bootstrapWorkspaceIfMissing !== false
  ) {
    resolvedWorkspace = toWorkspaceSnapshot(
      await createWorkspaceForUser({
        userId,
        userName: user.name,
        isCheckout: input.isCheckout,
      })
    );
    source = resolvedWorkspace ? "bootstrapped" : "none";
    if (resolvedWorkspace) {
      // TASK 2: Prevent duplicate link write by updating local in-memory state
      user.businessId = resolvedWorkspace.id;
      isCreatedWorkspace = true;
    }
  }

  if (
    resolvedWorkspace &&
    input.persistResolvedBusinessId !== false &&
    user.businessId !== resolvedWorkspace.id
  ) {
    const tPersistStart = Date.now();
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
    console.log(`[DEEP_AUDIT] persistResolvedBusinessId user.update took ${Date.now() - tPersistStart}ms for userId: ${userId}`);
  }

  const result: UserWorkspaceIdentity = {
    businessId: resolvedWorkspace?.id || null,
    workspace: resolvedWorkspace,
    source,
  };
  setWorkspaceIdentityCache(cacheKey, result);

  // TASK 4: Instrumentation
  const elapsedMs = Date.now() - tStartTime;
  console.info("AUTH_IDENTITY_FASTPATH", {
    source: isCreatedWorkspace ? "created_workspace" : "lookup",
    identity_resolve_ms: elapsedMs,
  });

  return result;
};

export const getRequestBusinessId = (req: Request) =>
  (req.user as any)?.businessId || (req as any).apiKey?.businessId || (req as any).tenant?.businessId || null;

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
