import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { decrypt, encrypt } from "../utils/encrypt";
import { normalizeRole, type PermissionAction } from "./rbac.service";

export type ApiKeyScope = "READ_ONLY" | "WRITE" | "ADMIN";

export type ApiKeyRecord = {
  id: string;
  businessId: string;
  permissions: string[];
  scopes: ApiKeyScope[];
  name: string | null;
};

export type ApiKeyAuthFailureReason =
  | "not_found"
  | "revoked"
  | "deleted_business"
  | "deleted_user";

export type ApiKeyAuthenticationResult =
  | {
      ok: true;
      apiKey: ApiKeyRecord;
      keyFingerprint: string;
    }
  | {
      ok: false;
      reason: ApiKeyAuthFailureReason;
      businessId?: string | null;
      apiKeyId?: string | null;
      keyFingerprint: string;
    };

const DEFAULT_API_KEY_NAME = "Workspace API key";
const DEFAULT_API_KEY_PERMISSIONS: PermissionAction[] = ["messages:enqueue"];
const DEFAULT_API_KEY_SCOPES: ApiKeyScope[] = ["ADMIN"];
const API_KEY_SCOPES = new Set<ApiKeyScope>(["READ_ONLY", "WRITE", "ADMIN"]);

const normalizePermissions = (permissions?: string[] | null) => {
  const values = Array.isArray(permissions)
    ? permissions.map((permission) => String(permission || "").trim()).filter(Boolean)
    : [];

  return values.length ? Array.from(new Set(values)) : DEFAULT_API_KEY_PERMISSIONS;
};

const normalizeApiKeyScopes = (scopes?: unknown): ApiKeyScope[] => {
  const rawValues = Array.isArray(scopes)
    ? scopes
    : typeof scopes === "string"
      ? [scopes]
      : [];

  const values = Array.from(
    new Set(
      rawValues
        .map((scope) => String(scope || "").trim().toUpperCase())
        .filter((scope): scope is ApiKeyScope => API_KEY_SCOPES.has(scope as ApiKeyScope))
    )
  );

  return values.length ? values : DEFAULT_API_KEY_SCOPES;
};

const toJsonScopes = (scopes: ApiKeyScope[]) =>
  scopes as unknown as Prisma.InputJsonValue;

const toKeyFingerprint = (rawKey: string) => hashApiKey(rawKey).slice(0, 16);

export const hashApiKey = (rawKey: string) =>
  crypto
    .createHmac("sha256", process.env.JWT_SECRET as string)
    .update(rawKey)
    .digest("hex");

const buildRawApiKey = () =>
  `sylph_live_${crypto.randomBytes(12).toString("hex")}_${crypto.randomBytes(24).toString("hex")}`;

const maskApiKey = (rawKey: string) =>
  rawKey.length <= 12
    ? rawKey
    : `${rawKey.slice(0, 8)}${"*".repeat(Math.max(rawKey.length - 14, 4))}${rawKey.slice(-6)}`;

const toApiKeyRecord = (apiKey: {
  id: string;
  businessId: string;
  permissions: string[];
  scopes?: unknown;
  name: string | null;
}) =>
  ({
    id: apiKey.id,
    businessId: apiKey.businessId,
    permissions: apiKey.permissions,
    scopes: normalizeApiKeyScopes(apiKey.scopes),
    name: apiKey.name,
  }) satisfies ApiKeyRecord;

export const hasApiKeyPermission = (
  apiKey: {
    scopes?: unknown;
  },
  action: string
) => {
  const normalizedAction = String(action || "").trim().toUpperCase();

  if (!normalizedAction || normalizedAction === "OPTIONS" || normalizedAction === "HEAD") {
    return true;
  }

  const scopes = normalizeApiKeyScopes(apiKey.scopes);

  if (scopes.includes("ADMIN")) {
    return true;
  }

  if (scopes.includes("WRITE")) {
    return normalizedAction === "GET" || normalizedAction === "POST" || normalizedAction === "PUT";
  }

  if (scopes.includes("READ_ONLY")) {
    return normalizedAction === "GET";
  }

  return false;
};

export const createApiKey = async (input: {
  businessId: string;
  createdByUserId?: string | null;
  name?: string | null;
  permissions?: string[] | null;
  scopes?: unknown;
}) => {
  const rawKey = buildRawApiKey();
  const permissions = normalizePermissions(input.permissions);
  const scopes = normalizeApiKeyScopes(input.scopes);
  const record = await prisma.apiKey.create({
    data: {
      key: hashApiKey(rawKey),
      encryptedKey: encrypt(rawKey),
      prefix: rawKey.slice(0, 16),
      name: input.name?.trim() || DEFAULT_API_KEY_NAME,
      permissions,
      scopes: toJsonScopes(scopes),
      businessId: input.businessId,
      createdByUserId: input.createdByUserId || null,
    },
  });

  return {
    id: record.id,
    businessId: record.businessId,
    permissions: record.permissions,
    scopes,
    name: record.name,
    rawKey,
    maskedKey: maskApiKey(rawKey),
    createdAt: record.createdAt,
  };
};

export const ensureWorkspaceApiKey = async (input: {
  businessId: string;
  createdByUserId?: string | null;
}) => {
  const existing = await prisma.apiKey.findFirst({
    where: {
      businessId: input.businessId,
      revokedAt: null,
      name: DEFAULT_API_KEY_NAME,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (existing) {
    try {
      const rawKey = decrypt(existing.encryptedKey);

      return {
        id: existing.id,
        businessId: existing.businessId,
        permissions: existing.permissions,
        scopes: normalizeApiKeyScopes(existing.scopes),
        name: existing.name,
        rawKey,
        maskedKey: maskApiKey(rawKey),
        createdAt: existing.createdAt,
      };
    } catch {
      await prisma.apiKey.update({
        where: {
          id: existing.id,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }
  }

  return createApiKey({
    businessId: input.businessId,
    createdByUserId: input.createdByUserId || null,
    name: DEFAULT_API_KEY_NAME,
    permissions: DEFAULT_API_KEY_PERMISSIONS,
    scopes: DEFAULT_API_KEY_SCOPES,
  });
};

export const listApiKeys = async (businessId: string) => {
  const records = await prisma.apiKey.findMany({
    where: {
      businessId,
      revokedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      prefix: true,
      name: true,
      permissions: true,
      scopes: true,
      lastUsedAt: true,
      createdAt: true,
      createdByUser: {
        select: {
          id: true,
          email: true,
          role: true,
        },
      },
    },
  });

  return records.map((record) => ({
    ...record,
    scopes: normalizeApiKeyScopes(record.scopes),
    role: normalizeRole(record.createdByUser?.role),
    maskedKey: `${record.prefix}${"*".repeat(12)}`,
  }));
};

export const revokeApiKey = async (input: {
  businessId: string;
  apiKeyId: string;
}) =>
  prisma.apiKey.updateMany({
    where: {
      id: input.apiKeyId,
      businessId: input.businessId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

export const rotateApiKey = async (input: {
  businessId: string;
  apiKeyId: string;
  rotatedByUserId?: string | null;
}) => {
  const existing = await prisma.apiKey.findFirst({
    where: {
      id: input.apiKeyId,
      businessId: input.businessId,
      revokedAt: null,
    },
    select: {
      id: true,
      businessId: true,
      name: true,
      permissions: true,
      scopes: true,
    },
  });

  if (!existing) {
    return null;
  }

  const rawKey = buildRawApiKey();
  const scopes = normalizeApiKeyScopes(existing.scopes);

  const created = await prisma.$transaction(async (tx) => {
    const nextKey = await tx.apiKey.create({
      data: {
        key: hashApiKey(rawKey),
        encryptedKey: encrypt(rawKey),
        prefix: rawKey.slice(0, 16),
        name: existing.name,
        permissions: existing.permissions,
        scopes: toJsonScopes(scopes),
        businessId: existing.businessId,
        createdByUserId: input.rotatedByUserId || null,
      },
    });

    await tx.apiKey.update({
      where: {
        id: existing.id,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return nextKey;
  });

  return {
    id: created.id,
    businessId: created.businessId,
    permissions: created.permissions,
    scopes,
    name: created.name,
    rawKey,
    maskedKey: maskApiKey(rawKey),
    createdAt: created.createdAt,
    revokedApiKeyId: existing.id,
  };
};

export const getApiKeyAuthenticationResult = async (
  rawKey: string
): Promise<ApiKeyAuthenticationResult> => {
  const keyHash = hashApiKey(rawKey);
  const keyFingerprint = toKeyFingerprint(rawKey);

  const apiKey = await prisma.apiKey.findFirst({
    where: {
      key: keyHash,
    },
    select: {
      id: true,
      businessId: true,
      permissions: true,
      scopes: true,
      name: true,
      revokedAt: true,
      business: {
        select: {
          deletedAt: true,
        },
      },
      createdByUser: {
        select: {
          deletedAt: true,
        },
      },
    },
  });

  if (!apiKey) {
    const prefix = rawKey.slice(0, 16);
    const prefixedKey = prefix
      ? await prisma.apiKey.findFirst({
          where: {
            prefix,
          },
          select: {
            id: true,
            businessId: true,
            revokedAt: true,
          },
        })
      : null;

    return {
      ok: false,
      reason: prefixedKey?.revokedAt ? "revoked" : "not_found",
      businessId: prefixedKey?.businessId || null,
      apiKeyId: prefixedKey?.id || null,
      keyFingerprint,
    };
  }

  if (apiKey.revokedAt) {
    return {
      ok: false,
      reason: "revoked",
      businessId: apiKey.businessId,
      apiKeyId: apiKey.id,
      keyFingerprint,
    };
  }

  if (apiKey.business.deletedAt) {
    return {
      ok: false,
      reason: "deleted_business",
      businessId: apiKey.businessId,
      apiKeyId: apiKey.id,
      keyFingerprint,
    };
  }

  if (apiKey.createdByUser?.deletedAt) {
    return {
      ok: false,
      reason: "deleted_user",
      businessId: apiKey.businessId,
      apiKeyId: apiKey.id,
      keyFingerprint,
    };
  }

  await prisma.apiKey.update({
    where: {
      id: apiKey.id,
    },
    data: {
      lastUsedAt: new Date(),
    },
  }).catch(() => undefined);

  return {
    ok: true,
    apiKey: toApiKeyRecord(apiKey),
    keyFingerprint,
  };
};

export const authenticateApiKey = async (rawKey: string) => {
  const result = await getApiKeyAuthenticationResult(rawKey);
  return result.ok ? result.apiKey : null;
};
