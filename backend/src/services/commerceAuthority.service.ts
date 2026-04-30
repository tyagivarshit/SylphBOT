import {
  CommerceProvider,
  CommerceProviderCredentialStatus,
  ExternalCommerceResolutionState,
  Prisma,
} from "@prisma/client";
import prisma from "../config/prisma";
import { env } from "../config/env";
import { encrypt } from "../utils/encrypt";
import { buildDeterministicDigest, mergeMetadata, normalizeActor, normalizeProvider } from "./commerce/shared";
import {
  enforceSecurityGovernanceInfluence,
  upsertSecretInVault,
} from "./security/securityGovernanceOS.service";

const IDEMPOTENCY_INFLIGHT_TIMEOUT_MS = 5 * 60 * 1000;

const toRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const toEncryptedRef = (value?: string | null) => {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("enc::")) {
    return normalized;
  }

  return `enc::${encrypt(normalized)}`;
};

const nowIso = () => new Date().toISOString();

const buildProviderEventKey = (provider: CommerceProvider, providerEventId: string) =>
  `${provider}:${String(providerEventId || "").trim() || "unknown_event"}`;

const buildProviderObjectKey = ({
  provider,
  providerObjectId,
  providerEventId,
  providerVersion,
  type,
}: {
  provider: CommerceProvider;
  providerObjectId?: string | null;
  providerEventId: string;
  providerVersion?: string | null;
  type?: string | null;
}) => {
  const normalizedVersion = String(providerVersion || "").trim() || "v0";
  const normalizedObject = String(providerObjectId || "").trim();

  if (normalizedObject) {
    return `${provider}:${normalizedObject}:${normalizedVersion}`;
  }

  const normalizedType = String(type || "unknown").trim() || "unknown";
  return `${provider}:event_object:${normalizedType}:${providerEventId}:${normalizedVersion}`;
};

const defaultCredentialRef = (
  provider: CommerceProvider
): {
  accessTokenRef?: string | null;
  signingSecretRef?: string | null;
  providerMetadata?: Record<string, unknown>;
} => {
  if (provider === "STRIPE") {
    return {
      accessTokenRef: toEncryptedRef(env.STRIPE_SECRET_KEY || ""),
      signingSecretRef: toEncryptedRef(env.STRIPE_WEBHOOK_SECRET || ""),
      providerMetadata: {
        source: "env_bootstrap",
      },
    };
  }

  return {
    providerMetadata: {
      source: "manual_required",
      hint: "seed_credential_via_commerce_api",
    },
  };
};

export type ExternalCommerceClaimResult = {
  state: "CLAIMED" | "REPLAYED" | "INFLIGHT";
  row: {
    id: string;
    providerEventKey: string;
    providerObjectKey: string;
    resolutionState: ExternalCommerceResolutionState;
    processedAt: Date | null;
    updatedAt: Date;
    metadata: Prisma.JsonValue | null;
  };
};

export const createCommerceAuthorityService = () => {
  const seedProviderCredentialIfMissing = async ({
    businessId,
    provider,
  }: {
    businessId: string;
    provider: string;
  }) => {
    const normalizedProvider = normalizeProvider(provider);

    if (normalizedProvider === "INTERNAL") {
      return null;
    }

    const existing = await prisma.commerceProviderCredential.findUnique({
      where: {
        businessId_provider: {
          businessId,
          provider: normalizedProvider,
        },
      },
    });

    if (existing) {
      return existing;
    }

    const defaults = defaultCredentialRef(normalizedProvider);

    return prisma.commerceProviderCredential.create({
      data: {
        businessId,
        provider: normalizedProvider,
        accessTokenRef: defaults.accessTokenRef || null,
        signingSecretRef: defaults.signingSecretRef || null,
        status: "ACTIVE",
        providerMetadata: defaults.providerMetadata as Prisma.InputJsonValue,
      },
    });
  };

  const upsertProviderCredential = async ({
    businessId,
    provider,
    accessTokenRef = null,
    refreshTokenRef = null,
    signingSecretRef = null,
    scope = null,
    expiresAt = null,
    revoked = false,
    status = null,
    providerMetadata = null,
  }: {
    businessId: string;
    provider: string;
    accessTokenRef?: string | null;
    refreshTokenRef?: string | null;
    signingSecretRef?: string | null;
    scope?: string | null;
    expiresAt?: Date | null;
    revoked?: boolean;
    status?: CommerceProviderCredentialStatus | null;
    providerMetadata?: Record<string, unknown> | null;
  }) => {
    await enforceSecurityGovernanceInfluence({
      domain: "COMMERCE",
      action: "security:manage",
      businessId,
      tenantId: businessId,
      actorId: "commerce_authority",
      actorType: "SERVICE",
      role: "SERVICE",
      permissions: ["security:manage"],
      scopes: ["ADMIN"],
      resourceType: "COMMERCE_CREDENTIAL",
      resourceId: provider,
      resourceTenantId: businessId,
      purpose: "CREDENTIAL_UPSERT",
      mfaVerified: true,
    });

    const normalizedProvider = normalizeProvider(provider);
    const nextStatus: CommerceProviderCredentialStatus = revoked
      ? "REVOKED"
      : status || "ACTIVE";

    if (accessTokenRef) {
      await upsertSecretInVault({
        businessId,
        tenantId: businessId,
        secretName: `commerce:${normalizedProvider}:access_token`,
        secretValue: accessTokenRef,
        secretType: "PROVIDER_TOKEN",
        blastRadius: "TENANT",
        createdBy: null,
        provider: normalizedProvider,
        credentialType: "ACCESS_TOKEN",
      }).catch(() => undefined);
    }

    if (signingSecretRef) {
      await upsertSecretInVault({
        businessId,
        tenantId: businessId,
        secretName: `commerce:${normalizedProvider}:signing_secret`,
        secretValue: signingSecretRef,
        secretType: "WEBHOOK_SECRET",
        blastRadius: "TENANT",
        createdBy: null,
        provider: normalizedProvider,
        credentialType: "SIGNING_SECRET",
      }).catch(() => undefined);
    }

    return prisma.commerceProviderCredential.upsert({
      where: {
        businessId_provider: {
          businessId,
          provider: normalizedProvider,
        },
      },
      update: {
        accessTokenRef: toEncryptedRef(accessTokenRef) || undefined,
        refreshTokenRef: toEncryptedRef(refreshTokenRef) || undefined,
        signingSecretRef: toEncryptedRef(signingSecretRef) || undefined,
        scope: scope === undefined ? undefined : scope,
        expiresAt: expiresAt === undefined ? undefined : expiresAt,
        revokedAt: revoked ? new Date() : undefined,
        status: nextStatus,
        providerMetadata: providerMetadata
          ? (providerMetadata as Prisma.InputJsonValue)
          : undefined,
        version: {
          increment: 1,
        },
      },
      create: {
        businessId,
        provider: normalizedProvider,
        accessTokenRef: toEncryptedRef(accessTokenRef) || null,
        refreshTokenRef: toEncryptedRef(refreshTokenRef) || null,
        signingSecretRef: toEncryptedRef(signingSecretRef) || null,
        scope: scope || null,
        expiresAt,
        revokedAt: revoked ? new Date() : null,
        status: nextStatus,
        providerMetadata: (providerMetadata || undefined) as Prisma.InputJsonValue,
      },
    });
  };

  const resolveProviderCredential = async ({
    businessId,
    provider,
  }: {
    businessId: string;
    provider: string;
  }) => {
    await enforceSecurityGovernanceInfluence({
      domain: "COMMERCE",
      action: "billing:view",
      businessId,
      tenantId: businessId,
      actorId: "commerce_authority",
      actorType: "SERVICE",
      role: "SERVICE",
      permissions: ["billing:view"],
      scopes: ["READ_ONLY"],
      resourceType: "COMMERCE_CREDENTIAL",
      resourceId: provider,
      resourceTenantId: businessId,
      purpose: "CREDENTIAL_RESOLVE",
    });

    const normalizedProvider = normalizeProvider(provider);
    await seedProviderCredentialIfMissing({
      businessId,
      provider: normalizedProvider,
    }).catch(() => undefined);

    const credential = await prisma.commerceProviderCredential.findUnique({
      where: {
        businessId_provider: {
          businessId,
          provider: normalizedProvider,
        },
      },
    });

    if (!credential) {
      return null;
    }

    const now = Date.now();
    const expired =
      credential.expiresAt instanceof Date && credential.expiresAt.getTime() <= now;
    const revoked =
      credential.status === "REVOKED" ||
      credential.revokedAt instanceof Date ||
      toRecord(credential.providerMetadata).revoked === true;

    if (revoked) {
      throw new Error(`provider_credential_revoked:${normalizedProvider}`);
    }

    if (expired || credential.status === "EXPIRED") {
      throw new Error(`provider_credential_expired:${normalizedProvider}`);
    }

    if (credential.status === "AUTH_FAILED") {
      throw new Error(`provider_credential_auth_failed:${normalizedProvider}`);
    }

    if (credential.status === "DISCONNECTED") {
      throw new Error(`provider_credential_disconnected:${normalizedProvider}`);
    }

    return credential;
  };

  const createManualOverride = async ({
    businessId,
    scope,
    reason,
    expiresAt,
    priority = 100,
    source = "HUMAN",
    provider = "ALL",
    createdBy = null,
    metadata = null,
  }: {
    businessId: string;
    scope: string;
    reason: string;
    expiresAt: Date;
    priority?: number;
    source?: string;
    provider?: string;
    createdBy?: string | null;
    metadata?: Record<string, unknown> | null;
  }) =>
    prisma.manualCommerceOverride.create({
      data: {
        businessId,
        scope: String(scope || "ALL").trim().toUpperCase() || "ALL",
        provider: String(provider || "ALL").trim().toUpperCase() || "ALL",
        manualLock: true,
        reason: String(reason || "manual_override").trim() || "manual_override",
        expiresAt,
        priority: Math.max(1, Math.floor(priority)),
        source: normalizeActor(source),
        isActive: true,
        createdBy,
        metadata: mergeMetadata(
          metadata,
          {
            createdAt: nowIso(),
          }
        ) as Prisma.InputJsonValue,
      },
    });

  const getActiveManualOverride = async ({
    businessId,
    scope,
    provider,
    now = new Date(),
  }: {
    businessId: string;
    scope: string;
    provider?: string | null;
    now?: Date;
  }) =>
    prisma.manualCommerceOverride.findFirst({
      where: {
        businessId,
        isActive: true,
        manualLock: true,
        expiresAt: {
          gt: now,
        },
        scope: {
          in: [
            "ALL",
            String(scope || "").trim().toUpperCase() || "ALL",
          ],
        },
        provider: {
          in: [
            "ALL",
            String(provider || "").trim().toUpperCase() || "ALL",
          ],
        },
      },
      orderBy: [
        {
          priority: "desc",
        },
        {
          updatedAt: "desc",
        },
      ],
    });

  const assertNoActiveManualOverride = async ({
    businessId,
    scope,
    provider = null,
  }: {
    businessId: string;
    scope: string;
    provider?: string | null;
  }) => {
    const active = await getActiveManualOverride({
      businessId,
      scope,
      provider,
    });

    if (!active) {
      return null;
    }

    throw new Error(`manual_commerce_override_active:${active.scope}:${active.reason}`);
  };

  const readExternalIdempotency = async ({
    providerEventKey,
    providerObjectKey,
  }: {
    providerEventKey: string;
    providerObjectKey: string;
  }) => {
    const [byEvent, byObject] = await Promise.all([
      prisma.externalCommerceIdempotency.findUnique({
        where: {
          providerEventKey,
        },
      }),
      prisma.externalCommerceIdempotency.findUnique({
        where: {
          providerObjectKey,
        },
      }),
    ]);

    return byEvent || byObject || null;
  };

  const claimExternalIdempotency = async ({
    businessId = null,
    provider,
    providerEventId,
    providerObjectId = null,
    providerVersion,
    eventType = null,
    metadata = null,
  }: {
    businessId?: string | null;
    provider: string;
    providerEventId: string;
    providerObjectId?: string | null;
    providerVersion: string;
    eventType?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<ExternalCommerceClaimResult> => {
    await enforceSecurityGovernanceInfluence({
      domain: "COMMERCE",
      action: "billing:view",
      businessId: businessId || null,
      tenantId: businessId || null,
      actorId: "commerce_authority",
      actorType: "SERVICE",
      role: "SERVICE",
      permissions: ["billing:view"],
      scopes: ["READ_ONLY"],
      resourceType: "COMMERCE_EVENT",
      resourceId: providerEventId,
      resourceTenantId: businessId || null,
      purpose: "IDEMPOTENCY_CLAIM",
      metadata: {
        provider,
        eventType: eventType || null,
      },
    });

    const normalizedProvider = normalizeProvider(provider);
    const providerEventKey = buildProviderEventKey(
      normalizedProvider,
      providerEventId
    );
    const providerObjectKey = buildProviderObjectKey({
      provider: normalizedProvider,
      providerObjectId,
      providerEventId,
      providerVersion,
      type: eventType,
    });
    const now = new Date();
    const existing = await readExternalIdempotency({
      providerEventKey,
      providerObjectKey,
    });

    if (existing) {
      if (existing.processedAt || existing.resolutionState === "PROCESSED") {
        return {
          state: "REPLAYED",
          row: {
            id: existing.id,
            providerEventKey: existing.providerEventKey,
            providerObjectKey: existing.providerObjectKey,
            resolutionState: existing.resolutionState,
            processedAt: existing.processedAt,
            updatedAt: existing.updatedAt,
            metadata: existing.metadata,
          },
        };
      }

      const stale =
        now.getTime() - new Date(existing.updatedAt).getTime() >
        IDEMPOTENCY_INFLIGHT_TIMEOUT_MS;

      if (!stale) {
        return {
          state: "INFLIGHT",
          row: {
            id: existing.id,
            providerEventKey: existing.providerEventKey,
            providerObjectKey: existing.providerObjectKey,
            resolutionState: existing.resolutionState,
            processedAt: existing.processedAt,
            updatedAt: existing.updatedAt,
            metadata: existing.metadata,
          },
        };
      }

      const reclaimed = await prisma.externalCommerceIdempotency.update({
        where: {
          id: existing.id,
        },
        data: {
          businessId: businessId || existing.businessId || undefined,
          providerVersion,
          resolutionState: "CLAIMED",
          metadata: mergeMetadata(existing.metadata, {
            ...(metadata || {}),
            reclaimedAt: now.toISOString(),
          }) as Prisma.InputJsonValue,
        },
      });

      return {
        state: "CLAIMED",
        row: {
          id: reclaimed.id,
          providerEventKey: reclaimed.providerEventKey,
          providerObjectKey: reclaimed.providerObjectKey,
          resolutionState: reclaimed.resolutionState,
          processedAt: reclaimed.processedAt,
          updatedAt: reclaimed.updatedAt,
          metadata: reclaimed.metadata,
        },
      };
    }

    try {
      const created = await prisma.externalCommerceIdempotency.create({
        data: {
          businessId,
          provider: normalizedProvider,
          providerEventKey,
          providerObjectKey,
          providerVersion,
          resolutionState: "CLAIMED",
          metadata: mergeMetadata(metadata, {
            claimedAt: now.toISOString(),
          }) as Prisma.InputJsonValue,
        },
      });

      return {
        state: "CLAIMED",
        row: {
          id: created.id,
          providerEventKey: created.providerEventKey,
          providerObjectKey: created.providerObjectKey,
          resolutionState: created.resolutionState,
          processedAt: created.processedAt,
          updatedAt: created.updatedAt,
          metadata: created.metadata,
        },
      };
    } catch (error) {
      if (String((error as any)?.code || "").toUpperCase() !== "P2002") {
        throw error;
      }

      const collision = await readExternalIdempotency({
        providerEventKey,
        providerObjectKey,
      });

      if (!collision) {
        throw error;
      }

      return {
        state:
          collision.processedAt || collision.resolutionState === "PROCESSED"
            ? "REPLAYED"
            : "INFLIGHT",
        row: {
          id: collision.id,
          providerEventKey: collision.providerEventKey,
          providerObjectKey: collision.providerObjectKey,
          resolutionState: collision.resolutionState,
          processedAt: collision.processedAt,
          updatedAt: collision.updatedAt,
          metadata: collision.metadata,
        },
      };
    }
  };

  const markExternalIdempotencyProcessed = async ({
    id,
    providerVersion,
    metadata = null,
  }: {
    id: string;
    providerVersion: string;
    metadata?: Record<string, unknown> | null;
  }) => {
    const current = await prisma.externalCommerceIdempotency.findUnique({
      where: {
        id,
      },
      select: {
        metadata: true,
      },
    });

    return prisma.externalCommerceIdempotency.update({
      where: {
        id,
      },
      data: {
        providerVersion,
        resolutionState: "PROCESSED",
        processedAt: new Date(),
        lastError: null,
        metadata: mergeMetadata(current?.metadata, {
          ...(metadata || {}),
          processedAt: nowIso(),
        }) as Prisma.InputJsonValue,
      },
    });
  };

  const markExternalIdempotencyFailed = async ({
    id,
    providerVersion,
    error,
    metadata = null,
  }: {
    id: string;
    providerVersion: string;
    error: string;
    metadata?: Record<string, unknown> | null;
  }) => {
    const current = await prisma.externalCommerceIdempotency.findUnique({
      where: {
        id,
      },
      select: {
        metadata: true,
      },
    });

    return prisma.externalCommerceIdempotency.update({
      where: {
        id,
      },
      data: {
        providerVersion,
        resolutionState: "FAILED",
        lastError: String(error || "unknown_error"),
        metadata: mergeMetadata(current?.metadata, {
          ...(metadata || {}),
          failedAt: nowIso(),
          error: String(error || "unknown_error"),
        }) as Prisma.InputJsonValue,
      },
    });
  };

  return {
    upsertProviderCredential,
    resolveProviderCredential,
    seedProviderCredentialIfMissing,
    createManualOverride,
    getActiveManualOverride,
    assertNoActiveManualOverride,
    claimExternalIdempotency,
    markExternalIdempotencyProcessed,
    markExternalIdempotencyFailed,
    buildProviderEventKey,
    buildProviderObjectKey,
    buildDigest: (value: unknown) => buildDeterministicDigest(value),
  };
};

export const commerceAuthorityService = createCommerceAuthorityService();
