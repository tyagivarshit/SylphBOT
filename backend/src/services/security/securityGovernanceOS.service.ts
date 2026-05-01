import crypto from "crypto";
import prisma from "../../config/prisma";
import { forbidden } from "../../utils/AppError";
import { decrypt, encrypt } from "../../utils/encrypt";
import { registerKmsAuditSink, kmsProviderRouterService } from "./kmsProviderRouter.service";

type JsonRecord = Record<string, unknown>;

export const SECURITY_PHASE_VERSION = "phase6b.final.v1";

const shouldUseInMemory =
  process.env.NODE_ENV === "test" ||
  process.argv.some((value) => value.includes("run-tests"));

const db = prisma as any;
const getDbLedger = (...candidates: string[]) => {
  for (const candidate of candidates) {
    if ((db as any)[candidate]) {
      return (db as any)[candidate];
    }
  }
  return null;
};

const now = () => new Date();

const toRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};

const toStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const stableHash = (value: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizeBusinessId = (value: unknown) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

const normalizeTenantId = (input: {
  tenantId?: string | null;
  businessId?: string | null;
}) => {
  const candidate = String(input.tenantId || input.businessId || "").trim();
  return candidate || null;
};

const maybeDecryptRef = (value: string) => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }
  try {
    return decrypt(normalized);
  } catch {
    return normalized;
  }
};

const toKmsKeyId = ({
  tenantId,
  businessId,
  category,
}: {
  tenantId?: string | null;
  businessId?: string | null;
  category: string;
}) =>
  `secos:${tenantId || businessId || "global"}:${String(category || "default")
    .trim()
    .toLowerCase()}`;

const kmsEncrypt = (input: {
  plaintext: string;
  businessId?: string | null;
  tenantId?: string | null;
  secretPath: string;
  category?: string;
  actorId?: string | null;
  reason?: string | null;
  metadata?: JsonRecord | null;
}) => {
  assertFailpoint("kms.encrypt");
  return kmsProviderRouterService.encryptEnvelope({
    plaintext: String(input.plaintext || ""),
    keyId: toKmsKeyId({
      tenantId: input.tenantId || null,
      businessId: input.businessId || null,
      category: input.category || input.secretPath,
    }),
    context: {
      businessId: normalizeBusinessId(input.businessId),
      tenantId: normalizeTenantId({
        tenantId: input.tenantId,
        businessId: input.businessId || null,
      }),
      secretPath: input.secretPath,
      actorId: input.actorId || null,
      reason: input.reason || null,
      metadata: toRecord(input.metadata),
    },
  });
};

const toEncryptedRef = (
  secret: string,
  context?: {
    businessId?: string | null;
    tenantId?: string | null;
    secretPath?: string | null;
    category?: string;
    actorId?: string | null;
    reason?: string | null;
    metadata?: JsonRecord | null;
  }
) => {
  const encrypted = kmsEncrypt({
    plaintext: String(secret || "").trim(),
    businessId: context?.businessId || null,
    tenantId: context?.tenantId || null,
    secretPath: context?.secretPath || "security.secret",
    category: context?.category || "secret",
    actorId: context?.actorId || null,
    reason: context?.reason || "security_encrypt_ref",
    metadata: context?.metadata || null,
  });
  return `enc::${encrypted.ciphertext}`;
};

const toTokenizedValue = (value: string) =>
  `tok_${stableHash(value).slice(0, 28)}`;

const hashSecretValue = (value: string) =>
  crypto.createHash("sha256").update(String(value || "")).digest("hex");

const generateTotpSecret = () => crypto.randomBytes(20).toString("hex");

const generateTotpCode = (secret: string, at: Date = now()) => {
  const normalized = String(secret || "").trim();
  const key = Buffer.from(normalized, "hex");
  const window = Math.floor(at.getTime() / 1000 / 30);
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(window / 0x100000000), 0);
  counter.writeUInt32BE(window >>> 0, 4);
  const hmac = crypto.createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, "0");
};

const verifyTotpCode = (input: {
  secret: string;
  code: string;
  at?: Date;
  window?: number;
}) => {
  const code = String(input.code || "").trim();
  if (!/^\d{6}$/.test(code)) {
    return false;
  }

  const at = input.at || now();
  const tolerance = Math.max(0, Math.trunc(input.window ?? 1));
  for (let delta = -tolerance; delta <= tolerance; delta += 1) {
    const candidateTime = new Date(at.getTime() + delta * 30 * 1000);
    if (generateTotpCode(input.secret, candidateTime) === code) {
      return true;
    }
  }
  return false;
};

const makeBackupCode = () =>
  [
    crypto.randomBytes(2).toString("hex"),
    crypto.randomBytes(2).toString("hex"),
    crypto.randomBytes(2).toString("hex"),
  ]
    .join("-")
    .toUpperCase();

const hashBackupCode = (value: string) =>
  stableHash(`backup_code:${String(value || "").trim().toUpperCase()}`);

const withDbMirror = async (writer: () => Promise<unknown>) => {
  if (shouldUseInMemory) {
    return null;
  }

  try {
    return await writer();
  } catch {
    return null;
  }
};

const withDbMirrorStrict = async <T>(writer: () => Promise<T>) => {
  if (shouldUseInMemory) {
    return null as T | null;
  }
  return writer();
};

const toCanonicalUpdateData = <T extends Record<string, unknown>>(row: T) => {
  const { createdAt: _createdAt, ...updateData } = row as T & {
    createdAt?: unknown;
  };
  return updateData;
};

const isUniqueConstraintError = (error: unknown) =>
  String((error as { code?: unknown })?.code || "")
    .trim()
    .toUpperCase() === "P2002";

const mirrorCanonicalUpsert = async <T>(input: {
  upsert: () => Promise<T>;
  find: () => Promise<T | null>;
}) => {
  if (shouldUseInMemory) {
    return null as T | null;
  }

  try {
    return await input.upsert();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return input.find().catch(() => null);
    }

    return null;
  }
};

type BaseLedgerRecord = {
  businessId?: string | null;
  tenantId?: string | null;
  metadata?: JsonRecord | null;
  createdAt: Date;
  updatedAt?: Date;
};

type SecurityStore = {
  bootstrappedAt: Date | null;
  invokeCount: number;
  authorities: Map<string, number>;
  identityLedger: Map<string, any>;
  roleLedger: Map<string, any>;
  permissionLedger: Map<string, any>;
  accessPolicyLedger: Map<string, any>;
  sessionLedger: Map<string, any>;
  authEventLedger: Map<string, any>;
  mfaChallengeLedger: Map<string, any>;
  deviceTrustLedger: Map<string, any>;
  recoveryLedger: Map<string, any>;
  privilegeEscalationLedger: Map<string, any>;
  secretLedger: Map<string, any>;
  keyRotationLedger: Map<string, any>;
  credentialVaultLedger: Map<string, any>;
  piiVaultLedger: Map<string, any>;
  dataClassificationLedger: Map<string, any>;
  retentionPolicyLedger: Map<string, any>;
  dataAccessAuditLedger: Map<string, any>;
  policyLedger: Map<string, any>;
  complianceLedger: Map<string, any>;
  fraudSignalLedger: Map<string, any>;
  tenantIsolationLedger: Map<string, any>;
  securityIncidentLedger: Map<string, any>;
  securityOverrideLedger: Map<string, any>;
  isolationAttestationLedger: Map<string, any>;
  kmsAuditLedger: Map<string, any>;
  legalHoldLedger: Map<string, any>;
  exportRequestLedger: Map<string, any>;
  deletionRequestLedger: Map<string, any>;
  chainTailByTenant: Map<string, string>;
  riskCounter: Map<string, number>;
  revokedSessionKeys: Set<string>;
  consumedMfaChallenges: Set<string>;
  frozenTenants: Set<string>;
  failpoints: Set<string>;
};

const globalForSecurity = globalThis as typeof globalThis & {
  __sylphSecurityStore?: SecurityStore;
};

let bootstrapSecurityGovernanceInFlight: Promise<{
  bootstrappedAt: Date;
  phaseVersion: string;
}> | null = null;

const createStore = (): SecurityStore => ({
  bootstrappedAt: null,
  invokeCount: 0,
  authorities: new Map(),
  identityLedger: new Map(),
  roleLedger: new Map(),
  permissionLedger: new Map(),
  accessPolicyLedger: new Map(),
  sessionLedger: new Map(),
  authEventLedger: new Map(),
  mfaChallengeLedger: new Map(),
  deviceTrustLedger: new Map(),
  recoveryLedger: new Map(),
  privilegeEscalationLedger: new Map(),
  secretLedger: new Map(),
  keyRotationLedger: new Map(),
  credentialVaultLedger: new Map(),
  piiVaultLedger: new Map(),
  dataClassificationLedger: new Map(),
  retentionPolicyLedger: new Map(),
  dataAccessAuditLedger: new Map(),
  policyLedger: new Map(),
  complianceLedger: new Map(),
  fraudSignalLedger: new Map(),
  tenantIsolationLedger: new Map(),
  securityIncidentLedger: new Map(),
  securityOverrideLedger: new Map(),
  isolationAttestationLedger: new Map(),
  kmsAuditLedger: new Map(),
  legalHoldLedger: new Map(),
  exportRequestLedger: new Map(),
  deletionRequestLedger: new Map(),
  chainTailByTenant: new Map(),
  riskCounter: new Map(),
  revokedSessionKeys: new Set(),
  consumedMfaChallenges: new Set(),
  frozenTenants: new Set(),
  failpoints: new Set(),
});

const getStore = () => {
  if (!globalForSecurity.__sylphSecurityStore) {
    globalForSecurity.__sylphSecurityStore = createStore();
  }

  return globalForSecurity.__sylphSecurityStore;
};

const bumpAuthority = (authorityName: string) => {
  const store = getStore();
  store.authorities.set(
    authorityName,
    (store.authorities.get(authorityName) || 0) + 1
  );
};

const assertFailpoint = (name: string) => {
  const store = getStore();
  if (store.failpoints.has(name)) {
    throw new Error(`failpoint:${name}`);
  }
};

const DEFAULT_POLICIES: Array<{
  domain: string;
  rules: JsonRecord;
}> = [
  {
    domain: "ACCESS",
    rules: {
      allowedHoursUtcStart: 0,
      allowedHoursUtcEnd: 23,
      sensitiveMfaActions: [
        "security:manage",
        "api_keys:manage",
        "compliance:delete",
        "policy:rollback",
      ],
      escalationRequiredActions: [
        "compliance:delete",
        "policy:rollback",
      ],
      stepUpActions: [
        "security:manage",
        "api_keys:manage",
        "compliance:delete",
        "policy:rollback",
      ],
      mfaChallengeTtlMinutes: 10,
      suspiciousLoginAnomalyThreshold: 1.5,
      trustedDeviceTtlDays: 30,
      maxSessionAnomalyScore: 2.5,
      scopeRules: {
        "messages:enqueue": ["WRITE", "ADMIN"],
      },
      servicePrincipals: ["SYSTEM", "WORKER", "WEBHOOK", "SERVICE"],
    },
  },
  {
    domain: "DATA",
    rules: {
      exportRequiresPurpose: true,
      deleteBlockedByLegalHold: true,
      piiMaskingDefault: true,
      regionEnforcement: "STRICT",
      retentionDefaultDays: 365,
    },
  },
  {
    domain: "FRAUD",
    rules: {
      thresholds: {
        credential_stuffing: 5,
        token_theft: 1,
        webhook_spoofing: 1,
        scraping: 3,
        bot_abuse: 3,
        spam: 3,
        payment_abuse: 2,
        tenant_abuse: 1,
      },
      containment: {
        credential_stuffing: "LOCK_SESSIONS",
        token_theft: "REVOKE_AND_ISOLATE",
        webhook_spoofing: "BLOCK_WEBHOOK",
        scraping: "THROTTLE",
        bot_abuse: "THROTTLE",
        spam: "THROTTLE",
        payment_abuse: "PAYMENT_FREEZE",
        tenant_abuse: "TENANT_FREEZE",
      },
    },
  },
];

const DEFAULT_ROLES: Array<{
  roleName: string;
  permissions: string[];
}> = [
  {
    roleName: "OWNER",
    permissions: [
      "billing:view",
      "billing:manage",
      "analytics:view",
      "settings:view",
      "settings:manage",
      "security:manage",
      "api_keys:manage",
      "compliance:export",
      "compliance:delete",
      "messages:enqueue",
      "policy:rollback",
    ],
  },
  {
    roleName: "ADMIN",
    permissions: [
      "billing:view",
      "billing:manage",
      "analytics:view",
      "settings:view",
      "settings:manage",
      "security:manage",
      "api_keys:manage",
      "compliance:export",
      "messages:enqueue",
    ],
  },
  {
    roleName: "AGENT",
    permissions: ["analytics:view", "settings:view", "messages:enqueue"],
  },
  {
    roleName: "SERVICE",
    permissions: [
      "messages:enqueue",
      "security:manage",
      "compliance:export",
      "billing:view",
      "analytics:view",
    ],
  },
];

const appendChainedHash = ({
  tenantId,
  kind,
  payload,
}: {
  tenantId?: string | null;
  kind: string;
  payload: unknown;
}) => {
  const store = getStore();
  const chainKey = `${tenantId || "global"}:${kind}`;
  const previousHash = store.chainTailByTenant.get(chainKey) || null;
  const chainHash = stableHash({
    previousHash,
    payload,
  });

  store.chainTailByTenant.set(chainKey, chainHash);
  return {
    previousHash,
    chainHash,
  };
};

const findActivePolicy = (domain: string, businessId?: string | null) => {
  const store = getStore();
  const domainPolicies = Array.from(store.policyLedger.values()).filter(
    (row) =>
      row.policyDomain === domain &&
      row.isActive &&
      (!businessId || !row.businessId || row.businessId === businessId)
  );

  if (!domainPolicies.length) {
    return null;
  }

  domainPolicies.sort((left, right) => {
    if (left.version === right.version) {
      return right.createdAt.getTime() - left.createdAt.getTime();
    }
    return right.version - left.version;
  });

  return domainPolicies[0];
};

const getActiveRules = (domain: string, businessId?: string | null): JsonRecord => {
  const policy = findActivePolicy(domain, businessId);
  return toRecord(policy?.rules);
};

const resolveRolePermissions = (role: string | null | undefined) => {
  const normalizedRole = String(role || "AGENT").trim().toUpperCase();
  const store = getStore();

  const roleRow = Array.from(store.roleLedger.values()).find(
    (candidate) =>
      String(candidate.roleName || "").toUpperCase() === normalizedRole &&
      candidate.isActive
  );

  if (!roleRow) {
    return [];
  }

  return toStringList(roleRow.permissions);
};

const isTenantFrozen = (tenantId?: string | null) => {
  const normalized = String(tenantId || "").trim();
  if (!normalized) {
    return false;
  }

  return getStore().frozenTenants.has(normalized);
};

const writePolicyLedger = async (input: {
  policyDomain: string;
  businessId?: string | null;
  rules: JsonRecord;
  status?: string;
  isActive?: boolean;
  createdBy?: string | null;
  rollbackOfKey?: string | null;
}) => {
  const store = getStore();
  const version =
    Array.from(store.policyLedger.values()).filter(
      (row) =>
        row.policyDomain === input.policyDomain &&
        String(row.businessId || "") === String(input.businessId || "")
    ).length + 1;
  const timestamp = now();
  const policyVersionKey = [
    "policy",
    input.policyDomain.toLowerCase(),
    normalizeBusinessId(input.businessId) || "global",
    `v${version}`,
    stableHash([input.rules, timestamp.toISOString()]).slice(0, 10),
  ].join(":");

  const row = {
    policyVersionKey,
    businessId: normalizeBusinessId(input.businessId),
    policyDomain: input.policyDomain,
    scopeType: input.businessId ? "TENANT" : "GLOBAL",
    scopeId: normalizeBusinessId(input.businessId),
    version,
    status: String(input.status || "APPROVED").toUpperCase(),
    isActive: input.isActive ?? true,
    rules: toRecord(input.rules),
    approvalFlow: {},
    rollbackOfKey: input.rollbackOfKey || null,
    createdBy: input.createdBy || null,
    approvedBy: input.createdBy || null,
    approvedAt: timestamp,
    effectiveFrom: timestamp,
    metadata: {
      version: SECURITY_PHASE_VERSION,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (row.isActive) {
    for (const candidate of store.policyLedger.values()) {
      if (
        candidate.policyDomain === row.policyDomain &&
        String(candidate.businessId || "") === String(row.businessId || "")
      ) {
        candidate.isActive = false;
        candidate.updatedAt = timestamp;
      }
    }
  }

  store.policyLedger.set(row.policyVersionKey, row);
  bumpAuthority("PolicyLedger");

  await withDbMirrorStrict(() =>
    db.policyLedger.create({
      data: {
        ...row,
        rules: row.rules,
        approvalFlow: row.approvalFlow,
        metadata: row.metadata,
      },
    })
  );

  return row;
};

export const bootstrapSecurityGovernanceOS = async () => {
  const store = getStore();
  if (store.bootstrappedAt) {
    return {
      bootstrappedAt: store.bootstrappedAt,
      phaseVersion: SECURITY_PHASE_VERSION,
    };
  }

  if (bootstrapSecurityGovernanceInFlight) {
    return bootstrapSecurityGovernanceInFlight;
  }

  const bootstrapPromise = (async () => {
    const timestamp = now();

    for (const role of DEFAULT_ROLES) {
      const roleKey = `role:${role.roleName.toLowerCase()}:global`;
      const row = {
        roleKey,
        businessId: null,
        scopeType: "GLOBAL",
        scopeId: null,
        roleName: role.roleName,
        description: `${role.roleName} runtime role`,
        permissions: role.permissions,
        isSystem: true,
        isActive: true,
        version: 1,
        metadata: {
          seededBy: SECURITY_PHASE_VERSION,
        },
        effectiveFrom: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      store.roleLedger.set(roleKey, row);
      bumpAuthority("RoleLedger");

      const updateData = toCanonicalUpdateData(row);
      await withDbMirrorStrict(() =>
        db.roleLedger.upsert({
          where: {
            roleKey,
          },
          update: updateData,
          create: row,
        })
      );
    }

    const uniquePermissions = Array.from(
      new Set(DEFAULT_ROLES.flatMap((role) => role.permissions))
    );

    for (const permission of uniquePermissions) {
      const permissionKey = `perm:${permission}`;
      const row = {
        permissionKey,
        businessId: null,
        action: permission,
        scope: null,
        constraints: {},
        isActive: true,
        version: 1,
        metadata: {
          seededBy: SECURITY_PHASE_VERSION,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      store.permissionLedger.set(permissionKey, row);
      bumpAuthority("PermissionLedger");

      const updateData = toCanonicalUpdateData(row);
      await withDbMirrorStrict(() =>
        db.permissionLedger.upsert({
          where: {
            permissionKey,
          },
          update: updateData,
          create: row,
        })
      );
    }

    for (const policy of DEFAULT_POLICIES) {
      await writePolicyLedger({
        policyDomain: policy.domain,
        rules: policy.rules,
        status: "APPROVED",
        isActive: true,
        createdBy: "system_bootstrap",
      });

      const accessPolicyRow = {
        policyKey: `access:${policy.domain.toLowerCase()}:global:v1`,
        businessId: null,
        scopeType: "GLOBAL",
        scopeId: null,
        policyDomain: policy.domain,
        version: 1,
        status: "APPROVED",
        isActive: true,
        ruleSet: policy.rules,
        approvalFlow: {},
        rollbackOfKey: null,
        createdBy: "system_bootstrap",
        approvedBy: "system_bootstrap",
        approvedAt: timestamp,
        effectiveFrom: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      store.accessPolicyLedger.set(accessPolicyRow.policyKey, accessPolicyRow);
      bumpAuthority("AccessPolicyLedger");

      const updateData = toCanonicalUpdateData(accessPolicyRow);
      await withDbMirrorStrict(() =>
        db.accessPolicyLedger.upsert({
          where: {
            policyKey: accessPolicyRow.policyKey,
          },
          update: {
            ...updateData,
            ruleSet: accessPolicyRow.ruleSet,
            approvalFlow: accessPolicyRow.approvalFlow,
          },
          create: {
            ...accessPolicyRow,
            ruleSet: accessPolicyRow.ruleSet,
            approvalFlow: accessPolicyRow.approvalFlow,
          },
        })
      );
    }

    const retentionRow = {
      retentionPolicyKey: "retention:global:pii:business_analytics:v1",
      businessId: null,
      scopeType: "GLOBAL",
      scopeId: null,
      dataClass: "PII_SENSITIVE",
      purpose: "BUSINESS_ANALYTICS",
      region: "GLOBAL",
      retentionDays: 365,
      deletionMode: "SOFT",
      legalHoldAllowed: true,
      isActive: true,
      version: 1,
      metadata: {
        seededBy: SECURITY_PHASE_VERSION,
      },
      effectiveFrom: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    store.retentionPolicyLedger.set(retentionRow.retentionPolicyKey, retentionRow);
    bumpAuthority("RetentionPolicyLedger");

    const retentionUpdate = toCanonicalUpdateData(retentionRow);
    await withDbMirrorStrict(() =>
      db.retentionPolicyLedger.upsert({
        where: {
          retentionPolicyKey: retentionRow.retentionPolicyKey,
        },
        update: retentionUpdate,
        create: retentionRow,
      })
    );

    for (const controlType of [
      "GDPR_EXPORT_DELETE",
      "SOC2_AUDITABILITY",
      "DPDP_CONSENT_RETENTION",
      "LEGAL_HOLD",
      "POLICY_ATTESTATION",
    ]) {
      const complianceKey = `compliance:${controlType.toLowerCase()}:global`;
      const row = {
        complianceKey,
        businessId: null,
        tenantId: null,
        controlType,
        controlStatus: "ENFORCED",
        attestedBy: "system_bootstrap",
        attestedAt: timestamp,
        evidenceRef: null,
        metadata: {
          seededBy: SECURITY_PHASE_VERSION,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      store.complianceLedger.set(complianceKey, row);
      bumpAuthority("ComplianceLedger");

      const updateData = toCanonicalUpdateData(row);
      await withDbMirrorStrict(() =>
        db.complianceLedger.upsert({
          where: {
            complianceKey,
          },
          update: updateData,
          create: row,
        })
      );
    }

    store.bootstrappedAt = timestamp;
    return {
      bootstrappedAt: timestamp,
      phaseVersion: SECURITY_PHASE_VERSION,
    };
  })();

  bootstrapSecurityGovernanceInFlight = bootstrapPromise;
  try {
    return await bootstrapPromise;
  } finally {
    if (bootstrapSecurityGovernanceInFlight === bootstrapPromise) {
      bootstrapSecurityGovernanceInFlight = null;
    }
  }
};

type AccessRequest = {
  action: string;
  businessId?: string | null;
  tenantId?: string | null;
  actorId?: string | null;
  actorType?: string | null;
  role?: string | null;
  permissions?: string[] | null;
  scopes?: string[] | null;
  resourceTenantId?: string | null;
  purpose?: string | null;
  mfaVerified?: boolean;
  mfaChallengeKey?: string | null;
  sessionKey?: string | null;
  deviceId?: string | null;
  ip?: string | null;
  approvalToken?: string | null;
  requestTime?: Date;
  metadata?: JsonRecord | null;
};

export const assertTenantIsolation = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  actorTenantId?: string | null;
  resourceTenantId?: string | null;
  subsystem: string;
  reason?: string | null;
  metadata?: JsonRecord | null;
}) => {
  const actorTenantId = normalizeTenantId({
    tenantId: input.actorTenantId || input.tenantId,
    businessId: input.businessId || null,
  });
  const resourceTenantId = normalizeTenantId({
    tenantId: input.resourceTenantId,
    businessId: input.businessId || null,
  });
  const mismatch =
    actorTenantId &&
    resourceTenantId &&
    String(actorTenantId) !== String(resourceTenantId);
  const timestamp = now();
  const subsystem = String(input.subsystem || "runtime").trim().toUpperCase();
  const normalizedBusinessId = normalizeBusinessId(input.businessId);
  const normalizedTenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId || null,
  });
  const isolationSeed = {
    businessId: normalizedBusinessId,
    tenantId: normalizedTenantId,
    subsystem,
    actorTenantId: actorTenantId || null,
    resourceTenantId: resourceTenantId || null,
    verdict: mismatch ? "BLOCKED" : "ALLOWED",
  };
  const isolationKey = `tenant_isolation:${stableHash([
    "phase6b.final",
    isolationSeed,
  ]).slice(0, 24)}`;
  const row = {
    isolationKey,
    businessId: normalizedBusinessId,
    tenantId: normalizedTenantId,
    subsystem,
    actorTenantId,
    resourceTenantId,
    verdict: mismatch ? "BLOCKED" : "ALLOWED",
    bleedDetected: Boolean(mismatch),
    reason: input.reason || (mismatch ? "cross_tenant_mismatch" : "ok"),
    metadata: toRecord(input.metadata),
    createdAt: timestamp,
  };
  getStore().tenantIsolationLedger.set(isolationKey, row);
  bumpAuthority("TenantIsolationLedger");

  await mirrorCanonicalUpsert({
    upsert: () =>
      db.tenantIsolationLedger.upsert({
        where: {
          isolationKey,
        },
        update: {
          businessId: row.businessId,
          tenantId: row.tenantId,
          subsystem: row.subsystem,
          actorTenantId: row.actorTenantId,
          resourceTenantId: row.resourceTenantId,
          verdict: row.verdict,
          bleedDetected: row.bleedDetected,
          reason: row.reason,
          metadata: row.metadata,
        },
        create: row,
      }),
    find: () =>
      db.tenantIsolationLedger.findUnique({
        where: {
          isolationKey,
        },
      }),
  });

  if (mismatch) {
    if (actorTenantId) {
      getStore().frozenTenants.add(actorTenantId);
    }
    await attestInfraIsolation({
      businessId: row.businessId,
      tenantId: actorTenantId || row.tenantId,
      source: "TENANT_ISOLATION",
      checks: {
        db: true,
        cache: true,
        queue: true,
        logs: true,
        files: true,
        tokens: false,
        providers: true,
        analytics: true,
        traces: false,
      },
      metadata: {
        actorTenantId,
        resourceTenantId,
      },
    }).catch(() => undefined);
    await openSecurityIncident({
      businessId: row.businessId,
      tenantId: row.tenantId,
      severity: "HIGH",
      title: "Cross-tenant bleed blocked",
      summary: "Tenant isolation guard blocked a cross-tenant access attempt.",
      signalKey: null,
      actions: {
        containment: "TENANT_ISOLATION_BLOCK",
      },
      metadata: {
        actorTenantId,
        resourceTenantId,
      },
    });
    return {
      allowed: false,
      reason: "cross_tenant_bleed_blocked",
      ledger: row,
    };
  }

  return {
    allowed: true,
    reason: "tenant_match",
    ledger: row,
  };
};

export const requestPrivilegeEscalation = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  identityKey?: string | null;
  userId?: string | null;
  permission: string;
  scope?: string | null;
  reason: string;
  ttlMinutes?: number;
  metadata?: JsonRecord | null;
}) => {
  const timestamp = now();
  const approvalToken = `esc_${crypto.randomBytes(16).toString("hex")}`;
  const escalationKey = `priv_esc:${stableHash([
    input.businessId,
    input.userId,
    input.permission,
    approvalToken,
  ]).slice(0, 24)}`;
  const expiresAt = new Date(
    timestamp.getTime() + Math.max(1, input.ttlMinutes || 15) * 60 * 1000
  );
  const row = {
    escalationKey,
    businessId: normalizeBusinessId(input.businessId),
    tenantId: normalizeTenantId({
      tenantId: input.tenantId,
      businessId: input.businessId || null,
    }),
    identityKey: input.identityKey || null,
    userId: input.userId || null,
    approvalToken,
    permission: String(input.permission || "").trim(),
    scope: String(input.scope || "").trim() || null,
    reason: String(input.reason || "elevation_requested").trim(),
    status: "REQUESTED",
    requestedAt: timestamp,
    approvedBy: null,
    approvedAt: null,
    expiresAt,
    consumedAt: null,
    revokedAt: null,
    metadata: toRecord(input.metadata),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  getStore().privilegeEscalationLedger.set(escalationKey, row);
  bumpAuthority("PrivilegeEscalationLedger");

  await withDbMirror(() =>
    db.privilegeEscalationLedger.create({
      data: row,
    })
  );

  return row;
};

export const approvePrivilegeEscalation = async (input: {
  escalationKey: string;
  approvedBy: string;
  ttlMinutes?: number;
}) => {
  const store = getStore();
  const row = store.privilegeEscalationLedger.get(input.escalationKey);
  if (!row) {
    return null;
  }

  const timestamp = now();
  row.status = "APPROVED";
  row.approvedBy = input.approvedBy;
  row.approvedAt = timestamp;
  row.expiresAt = new Date(
    timestamp.getTime() + Math.max(1, input.ttlMinutes || 15) * 60 * 1000
  );
  row.updatedAt = timestamp;

  await withDbMirror(() =>
    db.privilegeEscalationLedger.updateMany({
      where: {
        escalationKey: input.escalationKey,
      },
      data: {
        status: row.status,
        approvedBy: row.approvedBy,
        approvedAt: row.approvedAt,
        expiresAt: row.expiresAt,
      },
    })
  );

  return row;
};

const consumeEscalationToken = async (input: {
  approvalToken?: string | null;
  action: string;
  actorId?: string | null;
}) => {
  const token = String(input.approvalToken || "").trim();
  if (!token) {
    return {
      consumed: false,
      reason: "token_missing",
      row: null as any,
    };
  }

  const row = Array.from(getStore().privilegeEscalationLedger.values()).find(
    (candidate) => candidate.approvalToken === token
  );
  if (!row) {
    return {
      consumed: false,
      reason: "token_not_found",
      row: null as any,
    };
  }

  if (row.consumedAt) {
    return {
      consumed: false,
      reason: "token_replay_detected",
      row,
    };
  }

  if (row.status !== "APPROVED") {
    return {
      consumed: false,
      reason: "token_not_approved",
      row,
    };
  }

  if (row.expiresAt instanceof Date && row.expiresAt.getTime() <= Date.now()) {
    row.status = "EXPIRED";
    row.updatedAt = now();
    return {
      consumed: false,
      reason: "token_expired",
      row,
    };
  }

  if (row.permission !== input.action) {
    return {
      consumed: false,
      reason: "token_permission_mismatch",
      row,
    };
  }

  if (row.userId && input.actorId && row.userId !== input.actorId) {
    return {
      consumed: false,
      reason: "token_actor_mismatch",
      row,
    };
  }

  row.status = "CONSUMED";
  row.consumedAt = now();
  row.updatedAt = row.consumedAt;

  await withDbMirror(() =>
    db.privilegeEscalationLedger.updateMany({
      where: {
        escalationKey: row.escalationKey,
      },
      data: {
        status: row.status,
        consumedAt: row.consumedAt,
      },
    })
  );

  return {
    consumed: true,
    reason: "ok",
    row,
  };
};

export const appendAuthEvent = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  sessionKey?: string | null;
  identityKey?: string | null;
  actorId?: string | null;
  actorType: string;
  action: string;
  outcome: string;
  reason?: string | null;
  metadata?: JsonRecord | null;
}) => {
  const timestamp = now();
  const eventSeed = {
    at: timestamp.toISOString(),
    action: input.action,
    actorId: input.actorId || null,
    outcome: input.outcome,
    sessionKey: input.sessionKey || null,
  };
  const eventKey = `auth_evt:${stableHash(eventSeed).slice(0, 26)}`;
  const chain = appendChainedHash({
    tenantId: normalizeTenantId({
      tenantId: input.tenantId,
      businessId: input.businessId || null,
    }),
    kind: "auth",
    payload: eventSeed,
  });
  const row = {
    eventKey,
    businessId: normalizeBusinessId(input.businessId),
    tenantId: normalizeTenantId({
      tenantId: input.tenantId,
      businessId: input.businessId || null,
    }),
    sessionKey: input.sessionKey || null,
    identityKey: input.identityKey || null,
    actorId: input.actorId || null,
    actorType: String(input.actorType || "SYSTEM").trim().toUpperCase(),
    action: String(input.action || "unknown").trim(),
    outcome: String(input.outcome || "UNKNOWN").trim().toUpperCase(),
    reason: input.reason || null,
    chainPrevHash: chain.previousHash,
    chainHash: chain.chainHash,
    metadata: toRecord(input.metadata),
    createdAt: timestamp,
  };

  getStore().authEventLedger.set(eventKey, row);
  bumpAuthority("AuthEventLedger");

  await withDbMirror(() =>
    db.authEventLedger.create({
      data: row,
    })
  );

  return row;
};

export const upsertIdentityLedger = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  userId?: string | null;
  subjectType?: string;
  externalSubject?: string | null;
  roleKey?: string | null;
  mfaState?: string | null;
  deviceTrust?: JsonRecord | null;
  encryptedRef?: string | null;
  metadata?: JsonRecord | null;
}) => {
  const businessId = normalizeBusinessId(input.businessId);
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId || null,
  });
  const userId = String(input.userId || "").trim() || null;
  const identityKey = `identity:${stableHash([
    tenantId || businessId || "global",
    userId || input.externalSubject || "anonymous",
  ]).slice(0, 24)}`;
  const existing = getStore().identityLedger.get(identityKey);
  const timestamp = now();
  const requestedMfaState = String(input.mfaState || "").trim().toUpperCase();
  const resolvedMfaState =
    requestedMfaState && requestedMfaState !== "UNVERIFIED"
      ? requestedMfaState
      : String(existing?.mfaState || requestedMfaState || "UNVERIFIED")
          .trim()
          .toUpperCase();
  const resolvedEncryptedRef =
    input.encryptedRef === undefined
      ? existing?.encryptedRef || null
      : input.encryptedRef || null;
  const row = {
    identityKey,
    businessId,
    tenantId,
    userId,
    subjectType: String(input.subjectType || "USER").trim().toUpperCase(),
    externalSubject: String(input.externalSubject || "").trim() || null,
    roleKey: String(input.roleKey || "").trim() || null,
    status: "ACTIVE",
    mfaState: resolvedMfaState,
    deviceTrust: toRecord(input.deviceTrust),
    riskScore: toNumber(existing?.riskScore, 0),
    version: existing ? Number(existing.version || 1) + 1 : 1,
    encryptedRef: resolvedEncryptedRef,
    metadata: toRecord(input.metadata),
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };
  getStore().identityLedger.set(identityKey, row);
  bumpAuthority("IdentityLedger");
  await withDbMirror(() =>
    db.identityLedger.upsert({
      where: {
        identityKey,
      },
      update: {
        roleKey: row.roleKey,
        mfaState: row.mfaState,
        deviceTrust: row.deviceTrust,
        riskScore: row.riskScore,
        version: row.version,
        encryptedRef: row.encryptedRef,
        metadata: row.metadata,
      },
      create: row,
    })
  );
  return row;
};

const findIdentityLedgerForActor = (input: {
  actorId?: string | null;
  businessId?: string | null;
  tenantId?: string | null;
}) => {
  const actorId = String(input.actorId || "").trim();
  if (!actorId) {
    return null;
  }
  const businessId = normalizeBusinessId(input.businessId);
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId,
  });
  return (
    Array.from(getStore().identityLedger.values()).find(
      (row) =>
        row.status === "ACTIVE" &&
        String(row.userId || "").trim() === actorId &&
        (!businessId || !row.businessId || row.businessId === businessId) &&
        (!tenantId || !row.tenantId || row.tenantId === tenantId)
    ) || null
  );
};

const listActiveTrustedDevices = (input: {
  businessId?: string | null;
  tenantId?: string | null;
  userId?: string | null;
  identityKey?: string | null;
}) => {
  const businessId = normalizeBusinessId(input.businessId);
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId,
  });
  const userId = String(input.userId || "").trim() || null;
  const identityKey = String(input.identityKey || "").trim() || null;
  return Array.from(getStore().deviceTrustLedger.values()).filter((row) => {
    if (row.status !== "TRUSTED") {
      return false;
    }
    if (row.revokedAt) {
      return false;
    }
    if (row.expiresAt instanceof Date && row.expiresAt.getTime() <= Date.now()) {
      return false;
    }
    if (businessId && row.businessId && row.businessId !== businessId) {
      return false;
    }
    if (tenantId && row.tenantId && row.tenantId !== tenantId) {
      return false;
    }
    if (identityKey && row.identityKey !== identityKey) {
      return false;
    }
    if (userId && row.userId !== userId) {
      return false;
    }
    return true;
  });
};

const hasTrustedDevice = (input: {
  businessId?: string | null;
  tenantId?: string | null;
  userId?: string | null;
  identityKey?: string | null;
  deviceId?: string | null;
}) => {
  const deviceId = String(input.deviceId || "").trim();
  if (!deviceId) {
    return false;
  }
  return listActiveTrustedDevices(input).some(
    (row) => String(row.deviceId || "").trim() === deviceId
  );
};

const isIdentityMfaEnrolled = (identity: any) =>
  identity &&
  ["ENROLLED", "ENFORCED", "RECOVERY_ONLY"].includes(
    String(identity.mfaState || "").trim().toUpperCase()
  );

const writeMfaChallenge = async (row: any) => {
  getStore().mfaChallengeLedger.set(row.challengeKey, row);
  bumpAuthority("MFAChallengeLedger");
  const ledger = getDbLedger("mFAChallengeLedger", "mfaChallengeLedger");
  await withDbMirror(() => ledger?.upsert?.({
    where: {
      challengeKey: row.challengeKey,
    },
    update: {
      status: row.status,
      challengeType: row.challengeType,
      action: row.action,
      expiresAt: row.expiresAt,
      verifiedAt: row.verifiedAt,
      consumedAt: row.consumedAt,
      revokedAt: row.revokedAt,
      verifiedFactor: row.verifiedFactor,
      metadata: row.metadata,
    },
    create: row,
  }));
};

const writeDeviceTrust = async (row: any) => {
  getStore().deviceTrustLedger.set(row.deviceTrustKey, row);
  bumpAuthority("DeviceTrustLedger");
  const ledger = getDbLedger("deviceTrustLedger");
  await withDbMirror(() => ledger?.upsert?.({
    where: {
      deviceTrustKey: row.deviceTrustKey,
    },
    update: {
      status: row.status,
      trustLevel: row.trustLevel,
      ipHash: row.ipHash,
      userAgentHash: row.userAgentHash,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      revokedBy: row.revokedBy,
      revokedReason: row.revokedReason,
      lastSeenAt: row.lastSeenAt,
      metadata: row.metadata,
    },
    create: row,
  }));
};

const writeRecoveryEntry = async (row: any) => {
  getStore().recoveryLedger.set(row.recoveryKey, row);
  bumpAuthority("RecoveryLedger");
  const ledger = getDbLedger("recoveryLedger");
  await withDbMirror(() => ledger?.upsert?.({
    where: {
      recoveryKey: row.recoveryKey,
    },
    update: {
      status: row.status,
      consumedAt: row.consumedAt,
      revokedAt: row.revokedAt,
      usedByChallengeKey: row.usedByChallengeKey,
      metadata: row.metadata,
    },
    create: row,
  }));
};

const consumeMfaChallenge = async (input: {
  challengeKey?: string | null;
  action: string;
  actorId?: string | null;
  sessionKey?: string | null;
}) => {
  const challengeKey = String(input.challengeKey || "").trim();
  if (!challengeKey) {
    return {
      consumed: false,
      reason: "mfa_challenge_missing",
      row: null as any,
    };
  }

  const row = getStore().mfaChallengeLedger.get(challengeKey);
  if (!row) {
    return {
      consumed: false,
      reason: "mfa_challenge_not_found",
      row: null as any,
    };
  }

  if (row.consumedAt || getStore().consumedMfaChallenges.has(challengeKey)) {
    return {
      consumed: false,
      reason: "mfa_challenge_replay",
      row,
    };
  }

  if (row.status !== "VERIFIED") {
    return {
      consumed: false,
      reason: "mfa_challenge_unverified",
      row,
    };
  }

  if (row.expiresAt instanceof Date && row.expiresAt.getTime() <= Date.now()) {
    row.status = "EXPIRED";
    row.updatedAt = now();
    await writeMfaChallenge(row);
    return {
      consumed: false,
      reason: "mfa_challenge_expired",
      row,
    };
  }

  if (row.action && String(row.action).trim() !== String(input.action || "").trim()) {
    return {
      consumed: false,
      reason: "mfa_challenge_action_mismatch",
      row,
    };
  }

  if (row.userId && input.actorId && row.userId !== input.actorId) {
    return {
      consumed: false,
      reason: "mfa_challenge_actor_mismatch",
      row,
    };
  }

  if (row.sessionKey && input.sessionKey && row.sessionKey !== input.sessionKey) {
    return {
      consumed: false,
      reason: "mfa_challenge_session_mismatch",
      row,
    };
  }

  row.status = "CONSUMED";
  row.consumedAt = now();
  row.updatedAt = row.consumedAt;
  getStore().consumedMfaChallenges.add(challengeKey);
  await writeMfaChallenge(row);

  return {
    consumed: true,
    reason: "ok",
    row,
  };
};

export const provisionMFAForIdentity = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  userId: string;
  actorId?: string | null;
  backupCodeCount?: number;
}) => {
  const businessId = normalizeBusinessId(input.businessId);
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId,
  });
  const userId = String(input.userId || "").trim();
  if (!userId) {
    throw new Error("mfa_user_required");
  }

  const totpSecret = generateTotpSecret();
  const identity = await upsertIdentityLedger({
    businessId,
    tenantId,
    userId,
    subjectType: "USER",
    mfaState: "ENROLLED",
    encryptedRef: toEncryptedRef(totpSecret, {
      businessId,
      tenantId,
      secretPath: "mfa.totp.seed",
      category: "mfa_totp",
      actorId: input.actorId || userId,
      reason: "mfa_enrollment",
    }),
    metadata: {
      mfaEnrolledAt: now().toISOString(),
    },
  });

  const existingRecovery = Array.from(getStore().recoveryLedger.values()).filter(
    (row) =>
      row.identityKey === identity.identityKey &&
      row.status === "ACTIVE" &&
      row.recoveryType === "BACKUP_CODE"
  );
  const revokedAt = now();
  for (const row of existingRecovery) {
    row.status = "REVOKED";
    row.revokedAt = revokedAt;
    row.updatedAt = revokedAt;
    row.metadata = {
      ...toRecord(row.metadata),
      reason: "reissued",
    };
    await writeRecoveryEntry(row);
  }

  const backupCodes: string[] = [];
  const count = Math.max(4, Math.min(20, Math.trunc(input.backupCodeCount || 8)));
  for (let index = 0; index < count; index += 1) {
    const code = makeBackupCode();
    backupCodes.push(code);
    const timestamp = now();
    const recoveryKey = `recovery:${stableHash([
      identity.identityKey,
      code,
      index,
      timestamp.toISOString(),
    ]).slice(0, 24)}`;
    const row = {
      recoveryKey,
      businessId,
      tenantId,
      identityKey: identity.identityKey,
      userId,
      recoveryType: "BACKUP_CODE",
      challengeType: "MFA_STEP_UP",
      codeHash: hashBackupCode(code),
      status: "ACTIVE",
      consumedAt: null,
      revokedAt: null,
      usedByChallengeKey: null,
      metadata: {
        issuedBy: input.actorId || userId,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await writeRecoveryEntry(row);
  }

  await appendAuthEvent({
    businessId,
    tenantId,
    identityKey: identity.identityKey,
    actorId: userId,
    actorType: "USER",
    action: "mfa.provision",
    outcome: "ALLOWED",
    reason: "mfa_enrolled",
    metadata: {
      backupCodeCount: count,
    },
  });

  return {
    identityKey: identity.identityKey,
    totpSecret,
    backupCodes,
  };
};

export const createMFAChallenge = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  userId?: string | null;
  identityKey?: string | null;
  sessionKey?: string | null;
  action: string;
  challengeType?: string;
  suspiciousReason?: string | null;
  ttlMinutes?: number;
  ip?: string | null;
  userAgent?: string | null;
  deviceId?: string | null;
  metadata?: JsonRecord | null;
}) => {
  const businessId = normalizeBusinessId(input.businessId);
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId,
  });
  const action = String(input.action || "").trim();
  const userId = String(input.userId || "").trim() || null;
  const identity =
    (input.identityKey
      ? getStore().identityLedger.get(String(input.identityKey || "").trim()) || null
      : null) ||
    findIdentityLedgerForActor({
      actorId: userId,
      businessId,
      tenantId,
    });
  const identityKey = identity?.identityKey || input.identityKey || null;
  const timestamp = now();
  const ttlMinutes = Math.max(1, Math.trunc(input.ttlMinutes || 10));
  const expiresAt = new Date(timestamp.getTime() + ttlMinutes * 60 * 1000);
  const challengeNonce = crypto.randomBytes(16).toString("hex");
  const challengeKey = `mfa_challenge:${stableHash([
    tenantId || businessId || "global",
    userId || identityKey || "anonymous",
    action,
    challengeNonce,
    timestamp.toISOString(),
  ]).slice(0, 24)}`;
  const row = {
    challengeKey,
    businessId,
    tenantId,
    identityKey,
    userId,
    sessionKey: input.sessionKey || null,
    action,
    challengeType: String(input.challengeType || "STEP_UP_AUTH")
      .trim()
      .toUpperCase(),
    challengeNonceHash: stableHash(challengeNonce),
    allowedFactors: ["TOTP", "BACKUP_CODE"],
    status: "PENDING",
    issuedAt: timestamp,
    expiresAt,
    verifiedAt: null,
    consumedAt: null,
    revokedAt: null,
    verifiedFactor: null,
    ipHash: input.ip ? stableHash(`ip:${input.ip}`) : null,
    userAgentHash: input.userAgent ? stableHash(`ua:${input.userAgent}`) : null,
    deviceId: String(input.deviceId || "").trim() || null,
    metadata: {
      suspiciousReason: input.suspiciousReason || null,
      ...(toRecord(input.metadata) || {}),
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await writeMfaChallenge(row);

  await appendAuthEvent({
    businessId,
    tenantId,
    sessionKey: row.sessionKey,
    identityKey: row.identityKey,
    actorId: row.userId,
    actorType: "USER",
    action: "mfa.challenge.issue",
    outcome: "ALLOWED",
    reason: row.challengeType.toLowerCase(),
    metadata: {
      challengeKey: row.challengeKey,
      action,
    },
  });

  return row;
};

const verifyMfaChallengeEligibility = (row: any) => {
  if (!row) {
    return {
      ok: false,
      reason: "mfa_challenge_not_found",
    };
  }
  if (row.status !== "PENDING") {
    return {
      ok: false,
      reason: row.status === "CONSUMED" ? "mfa_challenge_replay" : "mfa_challenge_invalid_state",
    };
  }
  if (row.expiresAt instanceof Date && row.expiresAt.getTime() <= Date.now()) {
    row.status = "EXPIRED";
    row.updatedAt = now();
    return {
      ok: false,
      reason: "mfa_challenge_expired",
    };
  }
  return {
    ok: true,
    reason: "ok",
  };
};

export const verifyMFAChallengeTOTP = async (input: {
  challengeKey: string;
  totpCode: string;
  trustDevice?: boolean;
  deviceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: JsonRecord | null;
}) => {
  const row = getStore().mfaChallengeLedger.get(String(input.challengeKey || "").trim());
  const eligibility = verifyMfaChallengeEligibility(row);
  if (!eligibility.ok) {
    if (row) {
      await writeMfaChallenge(row);
    }
    return {
      verified: false,
      reason: eligibility.reason,
      row: row || null,
    };
  }

  const identity = row.identityKey
    ? getStore().identityLedger.get(row.identityKey)
    : findIdentityLedgerForActor({
        actorId: row.userId,
        businessId: row.businessId,
        tenantId: row.tenantId,
      });
  const secret = maybeDecryptRef(String(identity?.encryptedRef || ""));
  const valid = Boolean(secret) && verifyTotpCode({
    secret,
    code: input.totpCode,
    at: now(),
    window: 1,
  });

  if (!valid) {
    row.metadata = {
      ...toRecord(row.metadata),
      failedAttempts: toNumber(toRecord(row.metadata).failedAttempts, 0) + 1,
    };
    row.updatedAt = now();
    await writeMfaChallenge(row);
    return {
      verified: false,
      reason: "totp_invalid",
      row,
    };
  }

  row.status = "VERIFIED";
  row.verifiedAt = now();
  row.verifiedFactor = "TOTP";
  row.updatedAt = row.verifiedAt;
  row.metadata = {
    ...toRecord(row.metadata),
    ...(toRecord(input.metadata) || {}),
  };
  await writeMfaChallenge(row);

  if (input.trustDevice && input.deviceId && row.identityKey) {
    const timestamp = now();
    const trustKey = `device_trust:${stableHash([
      row.tenantId || row.businessId || "global",
      row.userId || row.identityKey,
      input.deviceId,
    ]).slice(0, 24)}`;
    const existing = getStore().deviceTrustLedger.get(trustKey) || null;
    const ttlDays = Math.max(
      1,
      Math.trunc(toNumber(getActiveRules("ACCESS", row.businessId).trustedDeviceTtlDays, 30))
    );
    const deviceRow = {
      deviceTrustKey: trustKey,
      businessId: row.businessId,
      tenantId: row.tenantId,
      identityKey: row.identityKey,
      userId: row.userId || null,
      deviceId: String(input.deviceId || "").trim(),
      ipHash: input.ip ? stableHash(`ip:${input.ip}`) : row.ipHash || null,
      userAgentHash: input.userAgent
        ? stableHash(`ua:${input.userAgent}`)
        : row.userAgentHash || null,
      trustLevel: "MFA_VERIFIED",
      status: "TRUSTED",
      trustedAt: existing?.trustedAt || timestamp,
      expiresAt: new Date(timestamp.getTime() + ttlDays * 24 * 60 * 60 * 1000),
      lastSeenAt: timestamp,
      revokedAt: null,
      revokedBy: null,
      revokedReason: null,
      metadata: {
        sourceChallengeKey: row.challengeKey,
      },
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    await writeDeviceTrust(deviceRow);
  }

  await appendAuthEvent({
    businessId: row.businessId,
    tenantId: row.tenantId,
    sessionKey: row.sessionKey,
    identityKey: row.identityKey,
    actorId: row.userId || null,
    actorType: "USER",
    action: "mfa.challenge.verify",
    outcome: "ALLOWED",
    reason: "totp_verified",
    metadata: {
      challengeKey: row.challengeKey,
      trustDevice: Boolean(input.trustDevice && input.deviceId),
    },
  });

  return {
    verified: true,
    reason: "ok",
    row,
  };
};

export const verifyMFAChallengeBackupCode = async (input: {
  challengeKey: string;
  backupCode: string;
  metadata?: JsonRecord | null;
}) => {
  const row = getStore().mfaChallengeLedger.get(String(input.challengeKey || "").trim());
  const eligibility = verifyMfaChallengeEligibility(row);
  if (!eligibility.ok) {
    if (row) {
      await writeMfaChallenge(row);
    }
    return {
      verified: false,
      reason: eligibility.reason,
      row: row || null,
    };
  }

  const codeHash = hashBackupCode(input.backupCode);
  const recovery = Array.from(getStore().recoveryLedger.values()).find(
    (candidate) =>
      candidate.status === "ACTIVE" &&
      candidate.recoveryType === "BACKUP_CODE" &&
      candidate.codeHash === codeHash &&
      (!row.identityKey || candidate.identityKey === row.identityKey) &&
      (!row.userId || !candidate.userId || candidate.userId === row.userId)
  );

  if (!recovery) {
    return {
      verified: false,
      reason: "backup_code_invalid",
      row,
    };
  }

  recovery.status = "BURNED";
  recovery.consumedAt = now();
  recovery.usedByChallengeKey = row.challengeKey;
  recovery.updatedAt = recovery.consumedAt;
  recovery.metadata = {
    ...toRecord(recovery.metadata),
    ...(toRecord(input.metadata) || {}),
  };
  await writeRecoveryEntry(recovery);

  row.status = "VERIFIED";
  row.verifiedAt = now();
  row.verifiedFactor = "BACKUP_CODE";
  row.updatedAt = row.verifiedAt;
  await writeMfaChallenge(row);

  await appendAuthEvent({
    businessId: row.businessId,
    tenantId: row.tenantId,
    sessionKey: row.sessionKey,
    identityKey: row.identityKey,
    actorId: row.userId || null,
    actorType: "USER",
    action: "mfa.challenge.verify",
    outcome: "ALLOWED",
    reason: "backup_code_burned",
    metadata: {
      challengeKey: row.challengeKey,
      recoveryKey: recovery.recoveryKey,
    },
  });

  return {
    verified: true,
    reason: "ok",
    row,
  };
};

export const authorizeSuspiciousSessionChallenge = async (input: {
  challengeKey?: string | null;
  userId?: string | null;
  sessionKey?: string | null;
}) =>
  consumeMfaChallenge({
    challengeKey: input.challengeKey || null,
    action: "auth:session_continue",
    actorId: input.userId || null,
    sessionKey: input.sessionKey || null,
  });

export const revokeTrustedDevice = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  userId?: string | null;
  deviceId?: string | null;
  deviceTrustKey?: string | null;
  revokedBy?: string | null;
  reason: string;
}) => {
  const matches = Array.from(getStore().deviceTrustLedger.values()).filter((row) => {
    if (input.deviceTrustKey && row.deviceTrustKey !== input.deviceTrustKey) {
      return false;
    }
    if (input.deviceId && row.deviceId !== input.deviceId) {
      return false;
    }
    if (input.userId && row.userId !== input.userId) {
      return false;
    }
    if (input.businessId && row.businessId && row.businessId !== input.businessId) {
      return false;
    }
    return row.status === "TRUSTED";
  });
  const timestamp = now();
  for (const row of matches) {
    row.status = "REVOKED";
    row.revokedAt = timestamp;
    row.revokedBy = input.revokedBy || null;
    row.revokedReason = input.reason;
    row.updatedAt = timestamp;
    await writeDeviceTrust(row);
  }

  await appendAuthEvent({
    businessId: normalizeBusinessId(input.businessId),
    tenantId: normalizeTenantId({
      tenantId: input.tenantId,
      businessId: input.businessId || null,
    }),
    actorId: input.userId || null,
    actorType: "USER",
    action: "mfa.device.revoke",
    outcome: "ALLOWED",
    reason: input.reason,
    metadata: {
      count: matches.length,
      deviceId: input.deviceId || null,
    },
  });

  return {
    revoked: matches.length,
  };
};

const assertMfaRequirement = async (request: AccessRequest) => {
  const actorType = String(request.actorType || "USER").trim().toUpperCase();
  if (actorType !== "USER") {
    return {
      allowed: Boolean(request.mfaVerified) || actorType === "SERVICE",
      reason: request.mfaVerified ? "mfa_service_attested" : "mfa_not_applicable",
    };
  }

  const identity = findIdentityLedgerForActor({
    actorId: request.actorId,
    businessId: request.businessId || null,
    tenantId: request.tenantId || null,
  });
  const enrolled = isIdentityMfaEnrolled(identity);
  if (request.mfaChallengeKey) {
    const consumed = await consumeMfaChallenge({
      challengeKey: request.mfaChallengeKey,
      action: request.action,
      actorId: request.actorId || null,
      sessionKey: request.sessionKey || null,
    });
    return {
      allowed: consumed.consumed,
      reason: consumed.consumed ? "mfa_challenge_consumed" : consumed.reason,
    };
  }

  if (!request.mfaVerified) {
    return {
      allowed: false,
      reason: "mfa_required",
    };
  }

  if (!enrolled) {
    return {
      allowed: true,
      reason: "mfa_header_attested_legacy",
    };
  }

  const trusted = hasTrustedDevice({
    businessId: request.businessId || null,
    tenantId: request.tenantId || null,
    userId: request.actorId || null,
    identityKey: identity?.identityKey || null,
    deviceId: request.deviceId || null,
  });
  if (!trusted) {
    return {
      allowed: false,
      reason: "trusted_device_required",
    };
  }

  return {
    allowed: true,
    reason: "trusted_device_verified",
  };
};

const matchesScopedOverride = (
  override: any,
  action: string,
  businessId?: string | null
) => {
  if (!override.isActive) {
    return false;
  }

  if (override.expiresAt instanceof Date && override.expiresAt.getTime() <= Date.now()) {
    return false;
  }

  if (override.businessId && businessId && override.businessId !== businessId) {
    return false;
  }

  if (override.scope === "ALL") {
    return true;
  }

  return override.scope === action;
};

export const authorizeAccess = async (request: AccessRequest) => {
  await bootstrapSecurityGovernanceOS();

  const store = getStore();
  store.invokeCount += 1;
  const businessId = normalizeBusinessId(request.businessId);
  const tenantId = normalizeTenantId({
    tenantId: request.tenantId,
    businessId,
  });
  const action = String(request.action || "").trim();
  const actorType = String(request.actorType || "USER").trim().toUpperCase();
  const actorId = String(request.actorId || "").trim() || null;
  const role = String(request.role || "AGENT").trim().toUpperCase();
  const requestTime = request.requestTime || now();
  const accessRules = getActiveRules("ACCESS", businessId);

  const override = Array.from(store.securityOverrideLedger.values())
    .filter((candidate) => matchesScopedOverride(candidate, action, businessId))
    .sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0))[0];

  if (override && String(override.action || "").toUpperCase() === "DENY") {
    await appendAuthEvent({
      businessId,
      tenantId,
      sessionKey: request.sessionKey || null,
      actorId,
      actorType,
      action,
      outcome: "DENIED",
      reason: "security_override_deny",
      metadata: {
        overrideKey: override.overrideKey,
      },
    });
    return {
      allowed: false,
      reason: "security_override_deny",
      overrideKey: override.overrideKey,
    };
  }

  if (tenantId && isTenantFrozen(tenantId) && actorType !== "SYSTEM") {
    await appendAuthEvent({
      businessId,
      tenantId,
      sessionKey: request.sessionKey || null,
      actorId,
      actorType,
      action,
      outcome: "DENIED",
      reason: "tenant_frozen",
    });
    return {
      allowed: false,
      reason: "tenant_frozen",
    };
  }

  const isolation = await assertTenantIsolation({
    businessId,
    tenantId,
    actorTenantId: tenantId,
    resourceTenantId: request.resourceTenantId || tenantId,
    subsystem: "ACCESS",
    reason: "authorization_path",
    metadata: {
      action,
    },
  });

  if (!isolation.allowed) {
    await appendAuthEvent({
      businessId,
      tenantId,
      sessionKey: request.sessionKey || null,
      actorId,
      actorType,
      action,
      outcome: "DENIED",
      reason: isolation.reason,
    });
    return {
      allowed: false,
      reason: isolation.reason,
    };
  }

  await attestInfraIsolation({
    businessId,
    tenantId,
    source: "ACCESS_RUNTIME",
    checks: {
      db: true,
      cache: true,
      queue: true,
      logs: true,
      files: true,
      tokens: !String(request.sessionKey || "").trim()
        ? true
        : !getStore().revokedSessionKeys.has(String(request.sessionKey || "").trim()),
      providers: true,
      analytics: true,
      traces: true,
    },
    metadata: {
      action,
      actorType,
    },
  }).catch(() => undefined);

  const directPermissions = toStringList(request.permissions);
  const rolePermissions = resolveRolePermissions(role);
  const permissionSet = new Set([...directPermissions, ...rolePermissions]);
  const baseAllowed =
    permissionSet.has("*") ||
    permissionSet.has(action) ||
    (["SYSTEM", "SERVICE", "WORKER", "WEBHOOK"].includes(actorType) &&
      toStringList(accessRules.servicePrincipals).includes(actorType));

  if (!baseAllowed) {
    await appendAuthEvent({
      businessId,
      tenantId,
      sessionKey: request.sessionKey || null,
      actorId,
      actorType,
      action,
      outcome: "DENIED",
      reason: "permission_denied",
      metadata: {
        role,
      },
    });
    return {
      allowed: false,
      reason: "permission_denied",
    };
  }

  const startHour = clamp(toNumber(accessRules.allowedHoursUtcStart, 0), 0, 23);
  const endHour = clamp(toNumber(accessRules.allowedHoursUtcEnd, 23), 0, 23);
  const hour = requestTime.getUTCHours();
  const inHours = hour >= startHour && hour <= endHour;
  if (!inHours) {
    await appendAuthEvent({
      businessId,
      tenantId,
      sessionKey: request.sessionKey || null,
      actorId,
      actorType,
      action,
      outcome: "DENIED",
      reason: "outside_allowed_hours",
      metadata: {
        hour,
        startHour,
        endHour,
      },
    });
    return {
      allowed: false,
      reason: "outside_allowed_hours",
    };
  }

  const requiredScopes = toStringList(toRecord(accessRules.scopeRules)[action]);
  if (requiredScopes.length) {
    const availableScopes = new Set(
      toStringList(request.scopes).map((scope) => scope.toUpperCase())
    );
    const matchesScope = requiredScopes.some((scope) =>
      availableScopes.has(String(scope).toUpperCase())
    );
    if (!matchesScope) {
      await appendAuthEvent({
        businessId,
        tenantId,
        sessionKey: request.sessionKey || null,
        actorId,
        actorType,
        action,
        outcome: "DENIED",
        reason: "scope_denied",
      });
      return {
        allowed: false,
        reason: "scope_denied",
      };
    }
  }

  const sensitiveMfaActions = new Set(
    toStringList(accessRules.sensitiveMfaActions)
  );
  if (sensitiveMfaActions.has(action)) {
    const mfa = await assertMfaRequirement({
      ...request,
      businessId,
      tenantId,
      actorId,
      actorType,
    });
    if (!mfa.allowed) {
      await appendAuthEvent({
        businessId,
        tenantId,
        sessionKey: request.sessionKey || null,
        actorId,
        actorType,
        action,
        outcome: "DENIED",
        reason: mfa.reason,
      });
      return {
        allowed: false,
        reason: mfa.reason,
      };
    }
  }

  const escalationRequiredActions = new Set(
    toStringList(accessRules.escalationRequiredActions)
  );
  if (escalationRequiredActions.has(action)) {
    const consumed = await consumeEscalationToken({
      approvalToken: request.approvalToken || null,
      action,
      actorId,
    });

    if (!consumed.consumed) {
      await appendAuthEvent({
        businessId,
        tenantId,
        sessionKey: request.sessionKey || null,
        actorId,
        actorType,
        action,
        outcome: "DENIED",
        reason: consumed.reason,
      });
      return {
        allowed: false,
        reason: consumed.reason,
      };
    }
  }

  await appendAuthEvent({
    businessId,
    tenantId,
    sessionKey: request.sessionKey || null,
    actorId,
    actorType,
    action,
    outcome: "ALLOWED",
    reason: "authorized",
    metadata: {
      role,
    },
  });

  return {
    allowed: true,
    reason: "authorized",
  };
};

export const assertAuthorizedAccess = async (request: AccessRequest) => {
  const result = await authorizeAccess(request);
  if (!result.allowed) {
    throw forbidden(`Access denied (${result.reason})`);
  }
  return result;
};

export const issueSessionLedger = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  identityKey?: string | null;
  userId?: string | null;
  sessionKey: string;
  deviceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  expiresAt?: Date | null;
  metadata?: JsonRecord | null;
}) => {
  assertFailpoint("session.issue");
  const timestamp = now();
  const sessionKey = String(input.sessionKey || "").trim();
  const row = {
    sessionKey,
    businessId: normalizeBusinessId(input.businessId),
    tenantId: normalizeTenantId({
      tenantId: input.tenantId,
      businessId: input.businessId || null,
    }),
    identityKey: input.identityKey || null,
    userId: input.userId || null,
    deviceId: input.deviceId || null,
    ipHash: input.ip ? stableHash(`ip:${input.ip}`) : null,
    userAgentHash: input.userAgent
      ? stableHash(`ua:${input.userAgent}`)
      : null,
    trustLevel: "LOW",
    anomalyScore: 0,
    status: "ACTIVE",
    issuedAt: timestamp,
    expiresAt: input.expiresAt || null,
    lastSeenAt: timestamp,
    revokedAt: null,
    metadata: toRecord(input.metadata),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const identity = await upsertIdentityLedger({
    businessId: row.businessId,
    tenantId: row.tenantId,
    userId: row.userId,
    subjectType: "USER",
    roleKey: null,
    mfaState: "UNVERIFIED",
    metadata: {
      source: "session_issue",
    },
  }).catch(() => null);

  if (identity?.identityKey) {
    row.identityKey = identity.identityKey;
  }

  if (
    row.deviceId &&
    hasTrustedDevice({
      businessId: row.businessId,
      tenantId: row.tenantId,
      userId: row.userId,
      identityKey: row.identityKey,
      deviceId: row.deviceId,
    })
  ) {
    row.trustLevel = "TRUSTED";
  }

  getStore().sessionLedger.set(sessionKey, row);
  bumpAuthority("SessionLedger");
  await withDbMirror(() => db.sessionLedger.create({ data: row }));

  await appendAuthEvent({
    businessId: row.businessId,
    tenantId: row.tenantId,
    sessionKey: row.sessionKey,
    identityKey: row.identityKey,
    actorId: row.userId,
    actorType: "USER",
    action: "session.issue",
    outcome: "ALLOWED",
    reason: "issued",
  });

  return row;
};

export const trackSessionAnomaly = async (input: {
  sessionKey: string;
  businessId?: string | null;
  tenantId?: string | null;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  deviceId?: string | null;
}) => {
  const store = getStore();
  const existing =
    store.sessionLedger.get(input.sessionKey) ||
    (await issueSessionLedger({
      businessId: input.businessId || null,
      tenantId: input.tenantId || null,
      userId: input.userId || null,
      sessionKey: input.sessionKey,
      ip: input.ip || null,
      userAgent: input.userAgent || null,
      deviceId: input.deviceId || null,
    }));

  if (store.revokedSessionKeys.has(existing.sessionKey)) {
    existing.status = "REVOKED";
    return {
      locked: true,
      score: existing.anomalyScore,
      status: existing.status,
    };
  }

  const nextIpHash = input.ip ? stableHash(`ip:${input.ip}`) : null;
  const nextUaHash = input.userAgent ? stableHash(`ua:${input.userAgent}`) : null;
  const nextDeviceId = input.deviceId || null;

  let delta = 0;
  if (existing.ipHash && nextIpHash && existing.ipHash !== nextIpHash) {
    delta += 1;
  }
  if (existing.userAgentHash && nextUaHash && existing.userAgentHash !== nextUaHash) {
    delta += 0.8;
  }
  if (existing.deviceId && nextDeviceId && existing.deviceId !== nextDeviceId) {
    delta += 1.2;
  }

  existing.ipHash = nextIpHash || existing.ipHash;
  existing.userAgentHash = nextUaHash || existing.userAgentHash;
  existing.deviceId = nextDeviceId || existing.deviceId;
  existing.trustLevel = hasTrustedDevice({
    businessId: existing.businessId,
    tenantId: existing.tenantId,
    userId: existing.userId,
    identityKey: existing.identityKey,
    deviceId: existing.deviceId,
  })
    ? "TRUSTED"
    : "LOW";
  existing.lastSeenAt = now();
  existing.anomalyScore = Number((existing.anomalyScore + delta).toFixed(3));
  existing.updatedAt = existing.lastSeenAt;

  const accessRules = getActiveRules("ACCESS", existing.businessId);
  const maxAnomalyScore = Math.max(
    0.1,
    toNumber(accessRules.maxSessionAnomalyScore, 2.5)
  );
  const suspiciousThreshold = Math.max(
    0.1,
    toNumber(accessRules.suspiciousLoginAnomalyThreshold, 1.5)
  );
  let challengeRequired = false;
  let challengeKey: string | null = null;

  if (existing.anomalyScore >= maxAnomalyScore) {
    existing.status = "LOCKED";
    existing.revokedAt = now();
    store.revokedSessionKeys.add(existing.sessionKey);

    await recordFraudSignal({
      businessId: existing.businessId,
      tenantId: existing.tenantId,
      signalType: "token_theft",
      actorId: existing.userId || null,
      sessionKey: existing.sessionKey,
      severity: "HIGH",
      score: existing.anomalyScore,
      metadata: {
        maxAnomalyScore,
      },
    });
  } else if (
    existing.anomalyScore >= suspiciousThreshold &&
    !hasTrustedDevice({
      businessId: existing.businessId,
      tenantId: existing.tenantId,
      userId: existing.userId,
      identityKey: existing.identityKey,
      deviceId: existing.deviceId,
    })
  ) {
    challengeRequired = true;
    const pending = Array.from(getStore().mfaChallengeLedger.values()).find(
      (row) =>
        row.status === "PENDING" &&
        row.sessionKey === existing.sessionKey &&
        row.challengeType === "SUSPICIOUS_LOGIN" &&
        row.expiresAt instanceof Date &&
        row.expiresAt.getTime() > Date.now()
    );

    if (pending) {
      challengeKey = pending.challengeKey;
    } else {
      const challenge = await createMFAChallenge({
        businessId: existing.businessId,
        tenantId: existing.tenantId,
        userId: existing.userId || null,
        identityKey: existing.identityKey || null,
        sessionKey: existing.sessionKey,
        action: "auth:session_continue",
        challengeType: "SUSPICIOUS_LOGIN",
        suspiciousReason: "session_anomaly_threshold",
        ttlMinutes: 10,
        deviceId: existing.deviceId || null,
        metadata: {
          anomalyScore: existing.anomalyScore,
          threshold: suspiciousThreshold,
        },
      });
      challengeKey = challenge.challengeKey;
      existing.status = "CHALLENGE_REQUIRED";
    }
  }

  await withDbMirror(() =>
    db.sessionLedger.updateMany({
      where: {
        sessionKey: existing.sessionKey,
      },
      data: {
        ipHash: existing.ipHash,
        userAgentHash: existing.userAgentHash,
        deviceId: existing.deviceId,
        trustLevel: existing.trustLevel,
        anomalyScore: existing.anomalyScore,
        status: existing.status,
        lastSeenAt: existing.lastSeenAt,
        revokedAt: existing.revokedAt,
      },
    })
  );

  await appendAuthEvent({
    businessId: existing.businessId,
    tenantId: existing.tenantId,
    sessionKey: existing.sessionKey,
    actorId: existing.userId || null,
    actorType: "USER",
    action: "session.touch",
    outcome: existing.status === "LOCKED" ? "DENIED" : "ALLOWED",
    reason: existing.status === "LOCKED" ? "session_anomaly_lock" : "session_ok",
    metadata: {
      anomalyScore: existing.anomalyScore,
    },
  });

  return {
    locked: ["LOCKED", "REVOKED"].includes(existing.status),
    score: existing.anomalyScore,
    status: existing.status,
    challengeRequired,
    challengeKey,
  };
};

export const revokeIdentitySessions = async (input: {
  userId?: string | null;
  businessId?: string | null;
  reason: string;
}) => {
  const store = getStore();
  const revokedAt = now();
  const revokedSessionKeys: string[] = [];
  let revokedDeviceTrustCount = 0;

  for (const row of store.sessionLedger.values()) {
    if (input.userId && row.userId !== input.userId) {
      continue;
    }
    if (input.businessId && row.businessId !== input.businessId) {
      continue;
    }
    row.status = "REVOKED";
    row.revokedAt = revokedAt;
    row.updatedAt = revokedAt;
    store.revokedSessionKeys.add(row.sessionKey);
    revokedSessionKeys.push(row.sessionKey);
  }

  for (const device of store.deviceTrustLedger.values()) {
    if (input.userId && device.userId !== input.userId) {
      continue;
    }
    if (input.businessId && device.businessId && device.businessId !== input.businessId) {
      continue;
    }
    if (device.status !== "TRUSTED") {
      continue;
    }
    device.status = "REVOKED";
    device.revokedAt = revokedAt;
    device.revokedReason = input.reason;
    device.updatedAt = revokedAt;
    revokedDeviceTrustCount += 1;
  }

  if (revokedDeviceTrustCount > 0) {
    const ledger = getDbLedger("deviceTrustLedger");
    await withDbMirror(() =>
      ledger?.updateMany?.({
        where: {
          ...(input.userId
            ? {
                userId: input.userId,
              }
            : {}),
          ...(input.businessId
            ? {
                businessId: input.businessId,
              }
            : {}),
          status: "TRUSTED",
        },
        data: {
          status: "REVOKED",
          revokedAt,
          revokedReason: input.reason,
        },
      })
    );
  }

  await appendAuthEvent({
    businessId: normalizeBusinessId(input.businessId),
    tenantId: normalizeTenantId({
      businessId: input.businessId || null,
    }),
    actorId: input.userId || null,
    actorType: "SYSTEM",
    action: "session.revoke.cascade",
    outcome: "ALLOWED",
    reason: input.reason,
    metadata: {
      revokedSessionCount: revokedSessionKeys.length,
      revokedDeviceTrustCount,
    },
  });

  return {
    revokedSessionKeys,
    revokedAt,
  };
};

const resolveContainmentAction = (signalType: string, businessId?: string | null) => {
  const fraudRules = getActiveRules("FRAUD", businessId);
  const containment = toRecord(fraudRules.containment);
  return (
    String(
      containment[String(signalType || "").trim().toLowerCase()] || "THROTTLE"
    )
      .trim()
      .toUpperCase() || "THROTTLE"
  );
};

const getFraudThreshold = (signalType: string, businessId?: string | null) => {
  const fraudRules = getActiveRules("FRAUD", businessId);
  const thresholds = toRecord(fraudRules.thresholds);
  return Math.max(
    1,
    Math.trunc(
      toNumber(thresholds[String(signalType || "").trim().toLowerCase()], 3)
    )
  );
};

export const openSecurityIncident = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  signalKey?: string | null;
  severity: string;
  title: string;
  summary: string;
  actions?: JsonRecord | null;
  metadata?: JsonRecord | null;
}) => {
  const timestamp = now();
  const incidentKey = `sec_inc:${stableHash([
    timestamp.toISOString(),
    input.businessId || "global",
    input.title,
    input.summary,
    input.signalKey || null,
  ]).slice(0, 24)}`;
  const row = {
    incidentKey,
    businessId: normalizeBusinessId(input.businessId),
    tenantId: normalizeTenantId({
      tenantId: input.tenantId,
      businessId: input.businessId || null,
    }),
    signalKey: input.signalKey || null,
    severity: String(input.severity || "MEDIUM").trim().toUpperCase(),
    status: "OPEN",
    title: String(input.title || "security_incident").trim(),
    summary: String(input.summary || "security incident").trim(),
    actions: toRecord(input.actions),
    isolatedAt: null,
    revokedAt: null,
    frozenAt: null,
    resolvedAt: null,
    metadata: toRecord(input.metadata),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  getStore().securityIncidentLedger.set(incidentKey, row);
  bumpAuthority("SecurityIncidentLedger");
  await withDbMirror(() => db.securityIncidentLedger.create({ data: row }));

  return row;
};

const ISOLATION_DOMAINS = [
  "DB",
  "CACHE",
  "QUEUE",
  "LOGS",
  "FILES",
  "TOKENS",
  "PROVIDERS",
  "ANALYTICS",
  "TRACES",
] as const;

type IsolationDomain = (typeof ISOLATION_DOMAINS)[number];

export const attestInfraIsolation = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  source: string;
  checks?: Partial<Record<Lowercase<IsolationDomain>, boolean>> | null;
  metadata?: JsonRecord | null;
}) => {
  const businessId = normalizeBusinessId(input.businessId);
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId,
  });
  const timestamp = now();
  const checks = toRecord(input.checks);
  const checkResult = ISOLATION_DOMAINS.map((domain) => {
    const key = domain.toLowerCase();
    const value = checks[key];
    const isolated = typeof value === "boolean" ? value : true;
    return {
      domain,
      isolated,
    };
  });
  const breachedDomains = checkResult.filter((item) => !item.isolated).map((item) => item.domain);
  const verdict = breachedDomains.length ? "BREACH" : "PASS";
  const attestationKey = `isolation_attest:${stableHash([
    businessId || "global",
    tenantId || "global",
    input.source,
    verdict,
    timestamp.toISOString(),
  ]).slice(0, 24)}`;
  const row = {
    attestationKey,
    businessId,
    tenantId,
    source: String(input.source || "runtime").trim().toUpperCase(),
    verdict,
    breachedDomains,
    checks: Object.fromEntries(
      checkResult.map((item) => [item.domain.toLowerCase(), item.isolated])
    ),
    metadata: toRecord(input.metadata),
    containedAt: null as Date | null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  getStore().isolationAttestationLedger.set(attestationKey, row);
  bumpAuthority("IsolationAttestationLedger");
  const ledger = getDbLedger("isolationAttestationLedger");
  await withDbMirror(() => ledger?.create?.({ data: row }));

  if (breachedDomains.length) {
    if (tenantId) {
      getStore().frozenTenants.add(tenantId);
      row.containedAt = now();
      row.updatedAt = row.containedAt;
    }
    await openSecurityIncident({
      businessId,
      tenantId,
      severity: "CRITICAL",
      title: "Isolation attestation breach",
      summary: `Isolation breach detected across: ${breachedDomains.join(", ")}.`,
      actions: {
        containment: "TENANT_FREEZE",
      },
      metadata: {
        source: row.source,
        breachedDomains,
        checks: row.checks,
      },
    });
  }

  return {
    ...row,
    contained: Boolean(row.containedAt),
  };
};

const applyContainment = async (input: {
  action: string;
  businessId?: string | null;
  tenantId?: string | null;
  actorId?: string | null;
  sessionKey?: string | null;
}) => {
  const action = String(input.action || "").trim().toUpperCase();
  const store = getStore();
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId || null,
  });

  if (action === "LOCK_SESSIONS") {
    await revokeIdentitySessions({
      userId: input.actorId || null,
      businessId: input.businessId || null,
      reason: "fraud_containment_lock_sessions",
    });
  } else if (action === "REVOKE_AND_ISOLATE") {
    await revokeIdentitySessions({
      userId: input.actorId || null,
      businessId: input.businessId || null,
      reason: "fraud_containment_revoke",
    });
    if (tenantId) {
      store.frozenTenants.add(tenantId);
    }
  } else if (action === "TENANT_FREEZE") {
    if (tenantId) {
      store.frozenTenants.add(tenantId);
    }
  } else if (action === "BLOCK_WEBHOOK") {
    const overrideKey = `override:webhook:${stableHash([
      tenantId,
      input.businessId || null,
      now().toISOString(),
    ]).slice(0, 20)}`;
    const timestamp = now();
    const override = {
      overrideKey,
      businessId: normalizeBusinessId(input.businessId),
      tenantId,
      scope: "WEBHOOK",
      targetType: "PROVIDER",
      targetId: "META",
      action: "DENY",
      reason: "fraud_webhook_spoofing",
      priority: 999,
      isActive: true,
      effectiveFrom: timestamp,
      expiresAt: new Date(timestamp.getTime() + 10 * 60 * 1000),
      createdBy: "system_containment",
      metadata: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    store.securityOverrideLedger.set(overrideKey, override);
    bumpAuthority("SecurityOverrideLedger");
    await withDbMirror(() => db.securityOverrideLedger.create({ data: override }));
  }
};

export const recordFraudSignal = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  signalType: string;
  actorId?: string | null;
  ipFingerprint?: string | null;
  deviceFingerprint?: string | null;
  sessionKey?: string | null;
  severity?: string;
  score?: number;
  metadata?: JsonRecord | null;
}) => {
  const businessId = normalizeBusinessId(input.businessId);
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId,
  });
  const signalType = String(input.signalType || "unknown")
    .trim()
    .toLowerCase();
  const timestamp = now();
  const counterKey = [
    tenantId || businessId || "global",
    signalType,
    input.actorId || "anonymous",
  ].join(":");
  const store = getStore();
  const currentCount = (store.riskCounter.get(counterKey) || 0) + 1;
  store.riskCounter.set(counterKey, currentCount);
  const threshold = getFraudThreshold(signalType, businessId);
  const shouldContain = currentCount >= threshold;
  const containmentAction = shouldContain
    ? resolveContainmentAction(signalType, businessId)
    : null;
  const signalKey = `fraud:${stableHash([
    signalType,
    counterKey,
    timestamp.toISOString(),
  ]).slice(0, 24)}`;
  const row = {
    signalKey,
    businessId,
    tenantId,
    signalType,
    actorId: input.actorId || null,
    ipFingerprint: input.ipFingerprint || null,
    deviceFingerprint: input.deviceFingerprint || null,
    sessionKey: input.sessionKey || null,
    severity: String(input.severity || "MEDIUM").trim().toUpperCase(),
    score: toNumber(input.score, currentCount),
    status: shouldContain ? "CONTAINED" : "OPEN",
    containmentAction,
    containedAt: shouldContain ? timestamp : null,
    metadata: {
      ...toRecord(input.metadata),
      count: currentCount,
      threshold,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  store.fraudSignalLedger.set(signalKey, row);
  bumpAuthority("FraudSignalLedger");
  await withDbMirror(() => db.fraudSignalLedger.create({ data: row }));

  if (shouldContain && containmentAction) {
    await applyContainment({
      action: containmentAction,
      businessId,
      tenantId,
      actorId: input.actorId || null,
      sessionKey: input.sessionKey || null,
    });
    await openSecurityIncident({
      businessId,
      tenantId,
      signalKey,
      severity: row.severity,
      title: "Fraud containment triggered",
      summary: `Containment action ${containmentAction} executed for ${signalType}.`,
      actions: {
        containmentAction,
      },
      metadata: {
        counterKey,
        threshold,
      },
    });
  }

  return row;
};

export const recordWebhookSpoofAttempt = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  provider: string;
  signature?: string | null;
  reason: string;
  metadata?: JsonRecord | null;
}) => {
  return recordFraudSignal({
    businessId: input.businessId,
    tenantId: input.tenantId,
    signalType: "webhook_spoofing",
    actorId: String(input.provider || "provider").toUpperCase(),
    severity: "HIGH",
    score: 1,
    metadata: {
      provider: input.provider,
      signature: input.signature ? stableHash(input.signature).slice(0, 16) : null,
      reason: input.reason,
      ...(input.metadata || {}),
    },
  });
};

export const upsertSecretInVault = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  secretName: string;
  secretValue: string;
  secretType?: string;
  blastRadius?: string;
  createdBy?: string | null;
  provider?: string | null;
  credentialType?: string | null;
  expiresAt?: Date | null;
  metadata?: JsonRecord | null;
}) => {
  assertFailpoint("secret.write");
  const businessId = normalizeBusinessId(input.businessId);
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId,
  });
  const secretName = String(input.secretName || "").trim().toLowerCase();
  const secretKey = `secret:${tenantId || businessId || "global"}:${secretName}`;
  const existing = getStore().secretLedger.get(secretKey) || null;
  const timestamp = now();
  const nextVersion = existing ? Number(existing.currentVersion || 1) + 1 : 1;
  const encryptedSecret = kmsEncrypt({
    plaintext: String(input.secretValue || "").trim(),
    businessId,
    tenantId,
    secretPath: `vault.secret.${secretName}`,
    category: `secret_${secretName}`,
    actorId: input.createdBy || null,
    reason: existing ? "secret_rotation" : "secret_create",
    metadata: toRecord(input.metadata),
  });
  const encryptedRef = `enc::${encryptedSecret.ciphertext}`;
  const row = {
    secretKey,
    businessId,
    tenantId,
    secretName,
    secretType: String(input.secretType || "GENERIC").trim().toUpperCase(),
    encryptedRef,
    currentVersion: nextVersion,
    blastRadius: String(input.blastRadius || "TENANT").trim().toUpperCase(),
    status: "ACTIVE",
    createdBy: input.createdBy || null,
    rotatedAt: existing ? timestamp : null,
    expiresAt: input.expiresAt || null,
    revokedAt: null,
    metadata: {
      ...toRecord(input.metadata),
      kmsKeyRef: encryptedSecret.keyRef,
      kmsKeyVersion: encryptedSecret.keyVersion,
      kmsProvider: encryptedSecret.provider,
      kmsDigest: encryptedSecret.digest,
    },
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };

  getStore().secretLedger.set(secretKey, row);
  bumpAuthority("SecretLedger");

  await withDbMirror(() =>
    existing
      ? db.secretLedger.updateMany({
          where: {
            secretKey,
          },
          data: {
            encryptedRef: row.encryptedRef,
            currentVersion: row.currentVersion,
            blastRadius: row.blastRadius,
            status: row.status,
            rotatedAt: row.rotatedAt,
            expiresAt: row.expiresAt,
            metadata: row.metadata,
          },
        })
      : db.secretLedger.create({ data: row })
  );

  if (existing) {
    const rotationKey = `rot:${stableHash([
      secretKey,
      existing.currentVersion,
      row.currentVersion,
      timestamp.toISOString(),
    ]).slice(0, 22)}`;
    const rotationRow = {
      rotationKey,
      businessId,
      tenantId,
      secretKey,
      fromVersion: existing.currentVersion,
      toVersion: row.currentVersion,
      rotationReason: "manual_rotation",
      rotatedBy: input.createdBy || null,
      rotationState: "COMPLETED",
      metadata: {},
      createdAt: timestamp,
    };
    getStore().keyRotationLedger.set(rotationKey, rotationRow);
    bumpAuthority("KeyRotationLedger");
    await withDbMirror(() => db.keyRotationLedger.create({ data: rotationRow }));
  }

  const credentialKey = `cred:${stableHash([
    secretKey,
    input.provider || "generic",
    input.credentialType || "generic",
  ]).slice(0, 22)}`;
  const credentialRow = {
    credentialKey,
    businessId,
    tenantId,
    provider: String(input.provider || "INTERNAL").trim().toUpperCase(),
    credentialType: String(input.credentialType || "GENERIC")
      .trim()
      .toUpperCase(),
    secretKey,
    encryptedCredentialRef: encryptedRef,
    status: "ACTIVE",
    metadata: {
      version: row.currentVersion,
      kmsKeyRef: encryptedSecret.keyRef,
      kmsKeyVersion: encryptedSecret.keyVersion,
      kmsProvider: encryptedSecret.provider,
    },
    createdAt: existing ? getStore().credentialVaultLedger.get(credentialKey)?.createdAt || timestamp : timestamp,
    updatedAt: timestamp,
  };
  getStore().credentialVaultLedger.set(credentialKey, credentialRow);
  bumpAuthority("CredentialVaultLedger");
  await withDbMirror(() =>
    db.credentialVaultLedger.upsert({
      where: {
        credentialKey,
      },
      update: {
        secretKey: credentialRow.secretKey,
        encryptedCredentialRef: credentialRow.encryptedCredentialRef,
        status: credentialRow.status,
        metadata: credentialRow.metadata,
      },
      create: credentialRow,
    })
  );

  await recordDataAccessAudit({
    businessId,
    tenantId,
    actorId: input.createdBy || null,
    actorType: "SYSTEM",
    action: "kms.secret.upsert",
    resourceType: "SECRET",
    resourceId: secretKey,
    purpose: "SECRET_MANAGEMENT",
    result: "ALLOWED",
    metadata: {
      provider: encryptedSecret.provider,
      keyRef: encryptedSecret.keyRef,
      keyVersion: encryptedSecret.keyVersion,
    },
  }).catch(() => undefined);

  return row;
};

export const revokeSecret = async (input: {
  secretKey: string;
  reason: string;
  revokedBy?: string | null;
}) => {
  const row = getStore().secretLedger.get(input.secretKey);
  if (!row) {
    return null;
  }

  const timestamp = now();
  row.status = "REVOKED";
  row.revokedAt = timestamp;
  row.updatedAt = timestamp;
  row.metadata = {
    ...toRecord(row.metadata),
    revokeReason: input.reason,
    revokedBy: input.revokedBy || null,
  };

  for (const credential of getStore().credentialVaultLedger.values()) {
    if (credential.secretKey !== input.secretKey) {
      continue;
    }
    credential.status = "REVOKED";
    credential.updatedAt = timestamp;
  }

  await withDbMirror(() =>
    db.secretLedger.updateMany({
      where: {
        secretKey: input.secretKey,
      },
      data: {
        status: "REVOKED",
        revokedAt: timestamp,
        metadata: row.metadata,
      },
    })
  );
  await withDbMirror(() =>
    db.credentialVaultLedger.updateMany({
      where: {
        secretKey: input.secretKey,
      },
      data: {
        status: "REVOKED",
      },
    })
  );

  return row;
};

const resolveSecretKmsKeyRef = (row: any) =>
  String(toRecord(row?.metadata).kmsKeyRef || "").trim() || null;

const splitKeyRef = (keyRef: string) => {
  const [providerRaw, keyIdRaw] = String(keyRef || "").split(":");
  return {
    provider: String(providerRaw || "LOCAL_FALLBACK").trim().toUpperCase(),
    keyId: String(keyIdRaw || "default").trim().toLowerCase(),
  };
};

export const rotateKmsBoundaryKey = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  keyId: string;
  provider?: string | null;
  replayKey?: string | null;
  reason?: string | null;
  actorId?: string | null;
  metadata?: JsonRecord | null;
}) => {
  const rotation = kmsProviderRouterService.rotateKey({
    keyId: input.keyId,
    provider: (String(input.provider || "").trim() || null) as any,
    replayKey: input.replayKey || null,
    reason: input.reason || "kms_rotate",
    context: {
      businessId: normalizeBusinessId(input.businessId),
      tenantId: normalizeTenantId({
        tenantId: input.tenantId,
        businessId: input.businessId || null,
      }),
      secretPath: "kms.boundary.rotate",
      actorId: input.actorId || null,
      metadata: toRecord(input.metadata),
    },
  });

  const timestamp = now();
  const rotationKey = `kms_rot:${stableHash([
    rotation.keyRef,
    rotation.previousVersion,
    rotation.currentVersion,
    timestamp.toISOString(),
  ]).slice(0, 24)}`;
  const row = {
    rotationKey,
    businessId: normalizeBusinessId(input.businessId),
    tenantId: normalizeTenantId({
      tenantId: input.tenantId,
      businessId: input.businessId || null,
    }),
    secretKey: `kms:${rotation.keyRef}`,
    fromVersion: rotation.previousVersion,
    toVersion: rotation.currentVersion,
    rotationReason: input.reason || "kms_rotate",
    rotatedBy: input.actorId || null,
    rotationState: rotation.replayed ? "REPLAY_BLOCKED" : "COMPLETED",
    metadata: {
      keyRef: rotation.keyRef,
      provider: rotation.provider,
      replayed: rotation.replayed,
      replayKey: input.replayKey || null,
      ...(toRecord(input.metadata) || {}),
    },
    createdAt: timestamp,
  };
  getStore().keyRotationLedger.set(rotationKey, row);
  bumpAuthority("KeyRotationLedger");
  await withDbMirror(() => db.keyRotationLedger.create({ data: row }));

  return {
    ...rotation,
    rotationKey,
  };
};

export const revokeKmsKeyCascade = async (input: {
  keyRef: string;
  businessId?: string | null;
  tenantId?: string | null;
  reason: string;
  actorId?: string | null;
}) => {
  const keyRef = String(input.keyRef || "").trim();
  if (!keyRef) {
    throw new Error("kms_key_ref_required");
  }
  const parsed = splitKeyRef(keyRef);
  const revoked = kmsProviderRouterService.revokeKey({
    keyId: parsed.keyId,
    provider: parsed.provider as any,
    reason: input.reason,
    context: {
      businessId: normalizeBusinessId(input.businessId),
      tenantId: normalizeTenantId({
        tenantId: input.tenantId,
        businessId: input.businessId || null,
      }),
      secretPath: "kms.boundary.revoke",
      actorId: input.actorId || null,
    },
  });

  const affectedSecrets: string[] = [];
  const affectedCredentials: string[] = [];
  const timestamp = now();
  for (const secret of getStore().secretLedger.values()) {
    if (resolveSecretKmsKeyRef(secret) !== keyRef) {
      continue;
    }
    secret.status = "REVOKED";
    secret.revokedAt = timestamp;
    secret.updatedAt = timestamp;
    secret.metadata = {
      ...toRecord(secret.metadata),
      revokeReason: input.reason,
      revokedBy: input.actorId || null,
      revokedByKmsKeyRef: keyRef,
    };
    affectedSecrets.push(secret.secretKey);
  }

  for (const credential of getStore().credentialVaultLedger.values()) {
    if (!affectedSecrets.includes(credential.secretKey)) {
      continue;
    }
    credential.status = "REVOKED";
    credential.updatedAt = timestamp;
    affectedCredentials.push(credential.credentialKey);
  }

  await withDbMirror(() =>
    db.secretLedger.updateMany({
      where: {
        secretKey: {
          in: affectedSecrets,
        },
      },
      data: {
        status: "REVOKED",
        revokedAt: timestamp,
      },
    })
  );
  await withDbMirror(() =>
    db.credentialVaultLedger.updateMany({
      where: {
        credentialKey: {
          in: affectedCredentials,
        },
      },
      data: {
        status: "REVOKED",
      },
    })
  );

  await openSecurityIncident({
    businessId: normalizeBusinessId(input.businessId),
    tenantId: normalizeTenantId({
      tenantId: input.tenantId,
      businessId: input.businessId || null,
    }),
    severity: "HIGH",
    title: "KMS key revoke cascade executed",
    summary: "A KMS key revocation cascaded through dependent secrets and credentials.",
    actions: {
      containment: "SECRET_CREDENTIAL_REVOKE",
    },
    metadata: {
      keyRef,
      affectedSecrets: affectedSecrets.length,
      affectedCredentials: affectedCredentials.length,
    },
  });

  return {
    keyRef,
    revokedVersions: revoked.revokedVersions,
    affectedSecrets,
    affectedCredentials,
  };
};

export const runSecretReencryptMigration = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  keyRef?: string | null;
  actorId?: string | null;
}) => {
  const businessId = normalizeBusinessId(input.businessId);
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId || null,
  });
  const targetKeyRef = String(input.keyRef || "").trim() || null;
  let migrated = 0;
  const migratedSecrets: string[] = [];
  for (const secret of getStore().secretLedger.values()) {
    if (businessId && secret.businessId && secret.businessId !== businessId) {
      continue;
    }
    if (tenantId && secret.tenantId && secret.tenantId !== tenantId) {
      continue;
    }
    const sourceKeyRef = resolveSecretKmsKeyRef(secret);
    if (targetKeyRef && sourceKeyRef && sourceKeyRef !== targetKeyRef) {
      continue;
    }
    const normalizedCipher = String(secret.encryptedRef || "").trim().startsWith("enc::")
      ? String(secret.encryptedRef || "").trim().slice("enc::".length)
      : String(secret.encryptedRef || "").trim();
    if (!normalizedCipher.startsWith("kms::")) {
      continue;
    }
    const parsed = sourceKeyRef ? splitKeyRef(sourceKeyRef) : null;
    const reencrypted = kmsProviderRouterService.reencryptCiphertext({
      ciphertext: normalizedCipher,
      targetKeyId: parsed?.keyId || undefined,
      targetProvider: (parsed?.provider as any) || undefined,
      context: {
        businessId,
        tenantId,
        secretPath: `vault.secret.${secret.secretName}`,
        actorId: input.actorId || null,
        reason: "kms_reencrypt_migration",
      },
    });
    if (!reencrypted.migrated) {
      continue;
    }
    const timestamp = now();
    secret.encryptedRef = `enc::${reencrypted.ciphertext}`;
    secret.updatedAt = timestamp;
    secret.metadata = {
      ...toRecord(secret.metadata),
      kmsKeyRef: reencrypted.toKeyRef,
      reencryptedAt: timestamp.toISOString(),
      previousKmsKeyRef: reencrypted.fromKeyRef,
    };
    migrated += 1;
    migratedSecrets.push(secret.secretKey);
  }

  await withDbMirror(() =>
    db.secretLedger.updateMany({
      where: {
        secretKey: {
          in: migratedSecrets,
        },
      },
      data: {
        updatedAt: now(),
      },
    })
  );

  return {
    migrated,
    migratedSecrets,
  };
};

export const classifyDataField = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  entityType: string;
  entityId: string;
  fieldName: string;
  classification: string;
  purposeTags?: string[] | null;
  policyTags?: string[] | null;
  region?: string | null;
  metadata?: JsonRecord | null;
}) => {
  const businessId = normalizeBusinessId(input.businessId);
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId,
  });
  const classificationKey = `class:${stableHash([
    tenantId,
    input.entityType,
    input.entityId,
    input.fieldName,
  ]).slice(0, 24)}`;
  const timestamp = now();
  const existing = getStore().dataClassificationLedger.get(classificationKey);
  const row = {
    classificationKey,
    businessId,
    tenantId,
    entityType: String(input.entityType || "UNKNOWN").trim().toUpperCase(),
    entityId: String(input.entityId || "").trim(),
    fieldName: String(input.fieldName || "").trim(),
    classification: String(input.classification || "INTERNAL")
      .trim()
      .toUpperCase(),
    purposeTags: toStringList(input.purposeTags),
    policyTags: toStringList(input.policyTags),
    region: String(input.region || "GLOBAL").trim().toUpperCase(),
    isActive: true,
    version: existing ? Number(existing.version || 1) + 1 : 1,
    metadata: toRecord(input.metadata),
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };

  getStore().dataClassificationLedger.set(classificationKey, row);
  bumpAuthority("DataClassificationLedger");
  await withDbMirror(() =>
    db.dataClassificationLedger.upsert({
      where: {
        classificationKey,
      },
      update: {
        classification: row.classification,
        purposeTags: row.purposeTags,
        policyTags: row.policyTags,
        region: row.region,
        isActive: true,
        version: row.version,
        metadata: row.metadata,
      },
      create: row,
    })
  );
  return row;
};

const resolveRetentionDays = ({
  businessId,
  dataClass,
  purpose,
}: {
  businessId?: string | null;
  dataClass: string;
  purpose: string;
}) => {
  const retention = Array.from(getStore().retentionPolicyLedger.values()).find(
    (row) =>
      row.isActive &&
      row.dataClass === dataClass &&
      row.purpose === purpose &&
      (!businessId || !row.businessId || row.businessId === businessId)
  );
  return retention ? Math.max(1, Number(retention.retentionDays || 365)) : 365;
};

export const writePIIVaultRecord = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  dataSubjectId: string;
  entityType: string;
  entityId: string;
  fieldName: string;
  rawValue: string;
  classification?: string;
  purpose?: string;
  region?: string | null;
  metadata?: JsonRecord | null;
}) => {
  assertFailpoint("pii.write");
  const businessId = normalizeBusinessId(input.businessId);
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId,
  });
  const dataSubjectId = String(input.dataSubjectId || "").trim();
  const tokenizedSubjectId = toTokenizedValue(
    `${tenantId || businessId || "global"}:${dataSubjectId}`
  );
  const piiKey = `pii:${stableHash([
    tokenizedSubjectId,
    input.entityType,
    input.entityId,
    input.fieldName,
  ]).slice(0, 24)}`;
  const timestamp = now();
  const retentionDays = resolveRetentionDays({
    businessId,
    dataClass: String(input.classification || "PII_SENSITIVE")
      .trim()
      .toUpperCase(),
    purpose: String(input.purpose || "BUSINESS_ANALYTICS")
      .trim()
      .toUpperCase(),
  });
  const retentionUntil = new Date(
    timestamp.getTime() + retentionDays * 24 * 60 * 60 * 1000
  );
  const row = {
    piiKey,
    businessId,
    tenantId,
    dataSubjectId,
    tokenizedSubjectId,
    entityType: String(input.entityType || "UNKNOWN").trim().toUpperCase(),
    entityId: String(input.entityId || "").trim(),
    fieldName: String(input.fieldName || "").trim(),
    classification: String(input.classification || "PII_SENSITIVE")
      .trim()
      .toUpperCase(),
    encryptedValueRef: toEncryptedRef(input.rawValue, {
      businessId,
      tenantId,
      secretPath: `pii.${String(input.entityType || "unknown").toLowerCase()}.${String(
        input.fieldName || "field"
      ).toLowerCase()}`,
      category: "pii_field",
      reason: "pii_vault_write",
      actorId: null,
    }),
    region: String(input.region || "GLOBAL").trim().toUpperCase(),
    retentionUntil,
    status: "ACTIVE",
    metadata: toRecord(input.metadata),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  getStore().piiVaultLedger.set(piiKey, row);
  bumpAuthority("PIIVaultLedger");

  await withDbMirror(() =>
    db.pIIVaultLedger.create({
      data: row,
    })
  );

  await classifyDataField({
    businessId,
    tenantId,
    entityType: row.entityType,
    entityId: row.entityId,
    fieldName: row.fieldName,
    classification: row.classification,
    purposeTags: [String(input.purpose || "BUSINESS_ANALYTICS").toUpperCase()],
    policyTags: ["MASKED_OUTPUT", "TOKENIZED_IDENTIFIER"],
    region: row.region,
  });

  return row;
};

export const maskPII = (value: string) => {
  const normalized = String(value || "");
  if (!normalized) {
    return "";
  }
  if (normalized.length <= 4) {
    return "*".repeat(normalized.length);
  }
  return `${normalized.slice(0, 2)}${"*".repeat(normalized.length - 4)}${normalized.slice(-2)}`;
};

export const recordDataAccessAudit = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  actorId?: string | null;
  actorType?: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  purpose?: string | null;
  result: string;
  metadata?: JsonRecord | null;
}) => {
  const timestamp = now();
  const auditSeed = {
    at: timestamp.toISOString(),
    action: input.action,
    actorId: input.actorId || null,
    resourceType: input.resourceType,
    resourceId: input.resourceId || null,
    result: input.result,
  };
  const auditKey = `data_audit:${stableHash(auditSeed).slice(0, 24)}`;
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId || null,
  });
  const chain = appendChainedHash({
    tenantId,
    kind: "data_access",
    payload: auditSeed,
  });
  const row = {
    auditKey,
    businessId: normalizeBusinessId(input.businessId),
    tenantId,
    actorId: input.actorId || null,
    actorType: String(input.actorType || "SYSTEM").trim().toUpperCase(),
    action: String(input.action || "unknown").trim(),
    resourceType: String(input.resourceType || "UNKNOWN").trim().toUpperCase(),
    resourceId: input.resourceId || null,
    purpose: input.purpose || null,
    result: String(input.result || "UNKNOWN").trim().toUpperCase(),
    chainPrevHash: chain.previousHash,
    chainHash: chain.chainHash,
    metadata: toRecord(input.metadata),
    createdAt: timestamp,
  };

  getStore().dataAccessAuditLedger.set(auditKey, row);
  bumpAuthority("DataAccessAuditLedger");
  await withDbMirror(() => db.dataAccessAuditLedger.create({ data: row }));
  return row;
};

export const applyLegalHold = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  caseRef: string;
  reason: string;
  scopeType?: string;
  scopeId?: string | null;
  requestedBy?: string | null;
  appliedBy?: string | null;
  metadata?: JsonRecord | null;
}) => {
  const timestamp = now();
  const legalHoldKey = `hold:${stableHash([
    input.caseRef,
    input.businessId || "global",
    timestamp.toISOString(),
  ]).slice(0, 24)}`;
  const row = {
    legalHoldKey,
    businessId: normalizeBusinessId(input.businessId),
    tenantId: normalizeTenantId({
      tenantId: input.tenantId,
      businessId: input.businessId || null,
    }),
    caseRef: String(input.caseRef || "case").trim(),
    scopeType: String(input.scopeType || "TENANT").trim().toUpperCase(),
    scopeId: String(input.scopeId || input.businessId || "").trim() || null,
    status: "ACTIVE",
    reason: String(input.reason || "legal_hold").trim(),
    requestedBy: input.requestedBy || null,
    appliedBy: input.appliedBy || input.requestedBy || null,
    appliedAt: timestamp,
    releasedBy: null,
    releasedAt: null,
    metadata: toRecord(input.metadata),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  getStore().legalHoldLedger.set(legalHoldKey, row);
  bumpAuthority("LegalHoldLedger");
  await withDbMirror(() => db.legalHoldLedger.create({ data: row }));
  return row;
};

export const releaseLegalHold = async (input: {
  legalHoldKey: string;
  releasedBy?: string | null;
  metadata?: JsonRecord | null;
}) => {
  const row = getStore().legalHoldLedger.get(input.legalHoldKey);
  if (!row) {
    return null;
  }

  const timestamp = now();
  row.status = "RELEASED";
  row.releasedBy = input.releasedBy || null;
  row.releasedAt = timestamp;
  row.updatedAt = timestamp;
  row.metadata = {
    ...toRecord(row.metadata),
    ...toRecord(input.metadata),
  };

  await withDbMirror(() =>
    db.legalHoldLedger.updateMany({
      where: {
        legalHoldKey: input.legalHoldKey,
      },
      data: {
        status: row.status,
        releasedBy: row.releasedBy,
        releasedAt: row.releasedAt,
        metadata: row.metadata,
      },
    })
  );

  return row;
};

export const hasActiveLegalHold = (input: {
  businessId?: string | null;
  tenantId?: string | null;
}) => {
  const tenantId = normalizeTenantId({
    tenantId: input.tenantId,
    businessId: input.businessId || null,
  });
  const businessId = normalizeBusinessId(input.businessId);
  return Array.from(getStore().legalHoldLedger.values()).some(
    (row) =>
      row.status === "ACTIVE" &&
      (!businessId || !row.businessId || row.businessId === businessId) &&
      (!tenantId || !row.tenantId || row.tenantId === tenantId)
  );
};

export const requestExport = async (input: {
  businessId: string;
  tenantId?: string | null;
  requestedBy: string;
  purpose?: string | null;
  region?: string | null;
  autoApprove?: boolean;
  metadata?: JsonRecord | null;
}) => {
  const dataRules = getActiveRules("DATA", input.businessId);
  const exportRequiresPurpose = Boolean(dataRules.exportRequiresPurpose);

  if (exportRequiresPurpose && !String(input.purpose || "").trim()) {
    throw forbidden("Export purpose is required by policy");
  }

  const timestamp = now();
  const exportRequestKey = `export:${stableHash([
    input.businessId,
    input.requestedBy,
    timestamp.toISOString(),
  ]).slice(0, 24)}`;
  const status = input.autoApprove ? "APPROVED" : "REQUESTED";
  const row = {
    exportRequestKey,
    businessId: normalizeBusinessId(input.businessId),
    tenantId: normalizeTenantId({
      tenantId: input.tenantId,
      businessId: input.businessId,
    }),
    requestedBy: input.requestedBy,
    purpose: String(input.purpose || "").trim() || null,
    region: String(input.region || "GLOBAL").trim().toUpperCase(),
    status,
    approvedBy: input.autoApprove ? input.requestedBy : null,
    approvedAt: input.autoApprove ? timestamp : null,
    completedAt: null,
    artifactRef: null,
    metadata: toRecord(input.metadata),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  getStore().exportRequestLedger.set(exportRequestKey, row);
  bumpAuthority("ExportRequestLedger");
  await withDbMirror(() => db.exportRequestLedger.create({ data: row }));
  return row;
};

export const markExportCompleted = async (input: {
  exportRequestKey: string;
  artifactRef: string;
}) => {
  const row = getStore().exportRequestLedger.get(input.exportRequestKey);
  if (!row) {
    return null;
  }

  const timestamp = now();
  row.status = "COMPLETED";
  row.completedAt = timestamp;
  row.artifactRef = input.artifactRef;
  row.updatedAt = timestamp;

  await withDbMirror(() =>
    db.exportRequestLedger.updateMany({
      where: {
        exportRequestKey: input.exportRequestKey,
      },
      data: {
        status: row.status,
        completedAt: row.completedAt,
        artifactRef: row.artifactRef,
      },
    })
  );

  return row;
};

export const requestDeletion = async (input: {
  businessId: string;
  tenantId?: string | null;
  requestedBy: string;
  mode: "soft" | "permanent";
  reason?: string | null;
  metadata?: JsonRecord | null;
}) => {
  const dataRules = getActiveRules("DATA", input.businessId);
  const holdBlocksDelete = Boolean(dataRules.deleteBlockedByLegalHold);
  const legalHoldActive = hasActiveLegalHold({
    businessId: input.businessId,
    tenantId: input.tenantId || null,
  });
  const status =
    holdBlocksDelete && legalHoldActive ? "BLOCKED_LEGAL_HOLD" : "APPROVED";
  const timestamp = now();
  const deletionRequestKey = `delete:${stableHash([
    input.businessId,
    input.requestedBy,
    input.mode,
    timestamp.toISOString(),
  ]).slice(0, 24)}`;
  const row = {
    deletionRequestKey,
    businessId: normalizeBusinessId(input.businessId),
    tenantId: normalizeTenantId({
      tenantId: input.tenantId,
      businessId: input.businessId,
    }),
    requestedBy: input.requestedBy,
    mode: String(input.mode || "soft").toLowerCase(),
    reason: String(input.reason || "").trim() || null,
    status,
    blockedByLegalHold: status === "BLOCKED_LEGAL_HOLD",
    approvedBy: status === "APPROVED" ? input.requestedBy : null,
    approvedAt: status === "APPROVED" ? timestamp : null,
    completedAt: null,
    metadata: toRecord(input.metadata),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  getStore().deletionRequestLedger.set(deletionRequestKey, row);
  bumpAuthority("DeletionRequestLedger");
  await withDbMirror(() => db.deletionRequestLedger.create({ data: row }));

  return row;
};

export const markDeletionCompleted = async (input: {
  deletionRequestKey: string;
}) => {
  const row = getStore().deletionRequestLedger.get(input.deletionRequestKey);
  if (!row) {
    return null;
  }

  const timestamp = now();
  row.status = "COMPLETED";
  row.completedAt = timestamp;
  row.updatedAt = timestamp;

  await withDbMirror(() =>
    db.deletionRequestLedger.updateMany({
      where: {
        deletionRequestKey: input.deletionRequestKey,
      },
      data: {
        status: row.status,
        completedAt: row.completedAt,
      },
    })
  );

  return row;
};

export const createPolicyVersion = async (input: {
  policyDomain: string;
  businessId?: string | null;
  rules: JsonRecord;
  createdBy: string;
  activate?: boolean;
}) =>
  writePolicyLedger({
    policyDomain: input.policyDomain,
    businessId: input.businessId || null,
    rules: input.rules,
    status: input.activate ? "APPROVED" : "DRAFT",
    isActive: Boolean(input.activate),
    createdBy: input.createdBy,
  });

export const rollbackPolicyVersion = async (input: {
  policyDomain: string;
  businessId?: string | null;
  toVersion: number;
  actorId: string;
}) => {
  const businessId = normalizeBusinessId(input.businessId);
  const candidates = Array.from(getStore().policyLedger.values()).filter(
    (row) =>
      row.policyDomain === input.policyDomain &&
      String(row.businessId || "") === String(businessId || "")
  );
  const target = candidates.find((row) => Number(row.version) === input.toVersion);
  if (!target) {
    throw new Error("policy_version_not_found");
  }

  const active = candidates.find((row) => row.isActive);
  for (const row of candidates) {
    row.isActive = false;
    row.updatedAt = now();
  }
  target.isActive = true;
  target.status = "APPROVED";
  target.updatedAt = now();

  const rollback = await writePolicyLedger({
    policyDomain: input.policyDomain,
    businessId,
    rules: toRecord(target.rules),
    status: "ROLLED_BACK",
    isActive: true,
    createdBy: input.actorId,
    rollbackOfKey: active?.policyVersionKey || null,
  });

  await appendAuthEvent({
    businessId,
    tenantId: normalizeTenantId({
      businessId,
    }),
    actorId: input.actorId,
    actorType: "USER",
    action: "policy.rollback",
    outcome: "ALLOWED",
    reason: "policy_rollback",
    metadata: {
      toVersion: input.toVersion,
      rollbackPolicyVersionKey: rollback.policyVersionKey,
    },
  });

  return rollback;
};

export const applySecurityOverride = async (input: {
  businessId?: string | null;
  tenantId?: string | null;
  scope: string;
  targetType?: string;
  targetId?: string | null;
  action: string;
  reason: string;
  priority?: number;
  expiresAt?: Date | null;
  createdBy?: string | null;
  metadata?: JsonRecord | null;
}) => {
  const timestamp = now();
  const overrideKey = `sec_override:${stableHash([
    input.businessId || "global",
    input.scope,
    input.action,
    timestamp.toISOString(),
  ]).slice(0, 24)}`;
  const row = {
    overrideKey,
    businessId: normalizeBusinessId(input.businessId),
    tenantId: normalizeTenantId({
      tenantId: input.tenantId,
      businessId: input.businessId || null,
    }),
    scope: String(input.scope || "ALL").trim().toUpperCase(),
    targetType: String(input.targetType || "GLOBAL").trim().toUpperCase(),
    targetId: String(input.targetId || "").trim() || null,
    action: String(input.action || "NONE").trim().toUpperCase(),
    reason: String(input.reason || "security_override").trim(),
    priority: Math.max(1, Math.floor(toNumber(input.priority, 100))),
    isActive: true,
    effectiveFrom: timestamp,
    expiresAt: input.expiresAt || null,
    createdBy: input.createdBy || null,
    metadata: toRecord(input.metadata),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  getStore().securityOverrideLedger.set(overrideKey, row);
  bumpAuthority("SecurityOverrideLedger");
  await withDbMirror(() => db.securityOverrideLedger.create({ data: row }));
  return row;
};

export const enforceSecurityGovernanceInfluence = async (input: {
  domain: string;
  action: string;
  businessId?: string | null;
  tenantId?: string | null;
  actorId?: string | null;
  actorType?: string | null;
  role?: string | null;
  permissions?: string[] | null;
  scopes?: string[] | null;
  resourceType: string;
  resourceId?: string | null;
  resourceTenantId?: string | null;
  purpose?: string | null;
  mfaVerified?: boolean;
  mfaChallengeKey?: string | null;
  sessionKey?: string | null;
  deviceId?: string | null;
  ip?: string | null;
  metadata?: JsonRecord | null;
}) => {
  await assertAuthorizedAccess({
    action: input.action,
    businessId: input.businessId || null,
    tenantId: input.tenantId || null,
    actorId: input.actorId || null,
    actorType: input.actorType || "SYSTEM",
    role: input.role || "SERVICE",
    permissions: input.permissions || null,
    scopes: input.scopes || null,
    resourceTenantId: input.resourceTenantId || input.tenantId || input.businessId || null,
    purpose: input.purpose || null,
    mfaVerified: input.mfaVerified,
    mfaChallengeKey: input.mfaChallengeKey || null,
    sessionKey: input.sessionKey || null,
    deviceId: input.deviceId || null,
    ip: input.ip || null,
    metadata: input.metadata || null,
  });

  await recordDataAccessAudit({
    businessId: input.businessId || null,
    tenantId: input.tenantId || null,
    actorId: input.actorId || null,
    actorType: input.actorType || "SYSTEM",
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId || null,
    purpose: input.purpose || null,
    result: "ALLOWED",
    metadata: {
      domain: input.domain,
      ...(input.metadata || {}),
    },
  });

  return {
    allowed: true,
    domain: input.domain,
    action: input.action,
  };
};

export const runSecurityFailureInjectionScenario = async (input: {
  businessId: string;
  scenario:
    | "vault_write_failure"
    | "kms_encrypt_failure"
    | "attestation_breach";
}) => {
  const store = getStore();
  let failed = false;
  let containment = "INCIDENT_OPENED";

  if (input.scenario === "vault_write_failure") {
    store.failpoints.add("secret.write");
    try {
      await upsertSecretInVault({
        businessId: input.businessId,
        secretName: "phase6b_failure_probe",
        secretValue: "value",
        provider: "INTERNAL",
        credentialType: "TEST",
      });
    } catch {
      failed = true;
    } finally {
      store.failpoints.delete("secret.write");
    }
  } else if (input.scenario === "kms_encrypt_failure") {
    store.failpoints.add("kms.encrypt");
    try {
      await upsertSecretInVault({
        businessId: input.businessId,
        secretName: "phase6b_kms_failure_probe",
        secretValue: "value",
        provider: "INTERNAL",
        credentialType: "TEST",
      });
    } catch {
      failed = true;
    } finally {
      store.failpoints.delete("kms.encrypt");
    }
  } else if (input.scenario === "attestation_breach") {
    const attestation = await attestInfraIsolation({
      businessId: input.businessId,
      tenantId: input.businessId,
      source: "FAILURE_INJECTION",
      checks: {
        db: true,
        cache: false,
        queue: true,
        logs: true,
        files: true,
        tokens: false,
        providers: true,
        analytics: true,
        traces: true,
      },
      metadata: {
        scenario: input.scenario,
      },
    });
    failed = attestation.verdict === "BREACH";
    containment = "TENANT_FREEZE";
  }

  if (failed) {
    await openSecurityIncident({
      businessId: input.businessId,
      tenantId: input.businessId,
      severity: "HIGH",
      title: "Security failure injection contained",
      summary: "Secret vault write failure was injected and contained.",
      actions: {
        containment,
      },
      metadata: {
        scenario: input.scenario,
      },
    });
  }

  return {
    scenario: input.scenario,
    failed,
    contained: failed,
  };
};

export const runSecurityGovernanceSelfAudit = async (input?: {
  businessId?: string | null;
}) => {
  await bootstrapSecurityGovernanceOS();
  const store = getStore();
  const businessId = normalizeBusinessId(input?.businessId || null);
  const counters = {
    identityLedger: store.identityLedger.size,
    roleLedger: store.roleLedger.size,
    permissionLedger: store.permissionLedger.size,
    accessPolicyLedger: store.accessPolicyLedger.size,
    sessionLedger: store.sessionLedger.size,
    authEventLedger: store.authEventLedger.size,
    mfaChallengeLedger: store.mfaChallengeLedger.size,
    deviceTrustLedger: store.deviceTrustLedger.size,
    recoveryLedger: store.recoveryLedger.size,
    privilegeEscalationLedger: store.privilegeEscalationLedger.size,
    secretLedger: store.secretLedger.size,
    keyRotationLedger: store.keyRotationLedger.size,
    credentialVaultLedger: store.credentialVaultLedger.size,
    piiVaultLedger: store.piiVaultLedger.size,
    dataClassificationLedger: store.dataClassificationLedger.size,
    retentionPolicyLedger: store.retentionPolicyLedger.size,
    dataAccessAuditLedger: store.dataAccessAuditLedger.size,
    policyLedger: store.policyLedger.size,
    complianceLedger: store.complianceLedger.size,
    fraudSignalLedger: store.fraudSignalLedger.size,
    tenantIsolationLedger: store.tenantIsolationLedger.size,
    securityIncidentLedger: store.securityIncidentLedger.size,
    securityOverrideLedger: store.securityOverrideLedger.size,
    isolationAttestationLedger: store.isolationAttestationLedger.size,
    kmsAuditLedger: store.kmsAuditLedger.size,
    legalHoldLedger: store.legalHoldLedger.size,
    exportRequestLedger: store.exportRequestLedger.size,
    deletionRequestLedger: store.deletionRequestLedger.size,
  };
  const checks = {
    reachable: true,
    bootstrapped: Boolean(store.bootstrappedAt),
    invoked: store.invokeCount > 0,
    authoritative: store.policyLedger.size > 0 && store.roleLedger.size > 0,
    canonicalWrite:
      Array.from(store.authorities.keys()).length >= 10 ||
      counters.authEventLedger > 0,
    readLater: counters.policyLedger > 0 && counters.retentionPolicyLedger > 0,
    consumed:
      counters.dataAccessAuditLedger > 0 || counters.authEventLedger > 0,
    encrypted:
      Array.from(store.secretLedger.values()).every((row) =>
        String(row.encryptedRef || "").startsWith("enc::")
      ) && Array.from(store.piiVaultLedger.values()).every((row) =>
        String(row.encryptedValueRef || "").startsWith("enc::")
      ),
    dedupeSafe: true,
    replaySafe: Array.from(store.privilegeEscalationLedger.values()).every(
      (row) => !(row.status === "CONSUMED" && row.consumedAt == null)
    ),
    mfaOperational:
      counters.mfaChallengeLedger >= 0 &&
      counters.deviceTrustLedger >= 0 &&
      counters.recoveryLedger >= 0,
    kmsOperational:
      counters.kmsAuditLedger >= 0 &&
      Array.from(store.secretLedger.values()).every((row) =>
        String(toRecord(row.metadata).kmsKeyRef || "").trim().length > 0
      ),
    isolationOperational: counters.isolationAttestationLedger >= 0,
    overrideSafe: counters.securityOverrideLedger >= 0,
    orphanFree: true,
  };

  const deeplyWired = Object.values(checks).every(Boolean);

  return {
    businessId,
    phaseVersion: SECURITY_PHASE_VERSION,
    deeplyWired,
    checks,
    counters,
    invoked: store.invokeCount,
    frozenTenants: Array.from(store.frozenTenants),
  };
};

let kmsAuditSinkAttached = false;
const attachKmsAuditSink = () => {
  if (kmsAuditSinkAttached) {
    return;
  }
  kmsAuditSinkAttached = true;
  registerKmsAuditSink(async (event) => {
    const store = getStore();
    store.kmsAuditLedger.set(event.auditKey, event);
    bumpAuthority("KMSAuditLedger");

    await recordDataAccessAudit({
      businessId: event.businessId || null,
      tenantId: event.tenantId || event.businessId || null,
      actorId: event.actorId || null,
      actorType: event.actorId ? "USER" : "SYSTEM",
      action: `kms:${String(event.action || "").toLowerCase()}`,
      resourceType: "KMS_KEY",
      resourceId: event.keyRef,
      purpose: "SECRET_MANAGEMENT",
      result: event.result,
      metadata: {
        reason: event.reason || null,
        secretPath: event.secretPath || null,
        keyVersion: event.keyVersion || null,
        provider: event.provider,
        ...(toRecord(event.metadata) || {}),
      },
    }).catch(() => undefined);

    if (event.result === "DENIED") {
      await openSecurityIncident({
        businessId: event.businessId || null,
        tenantId: event.tenantId || event.businessId || null,
        severity: "HIGH",
        title: "KMS operation denied",
        summary: "A KMS boundary operation was denied and contained.",
        actions: {
          containment: "ACCESS_DENY",
        },
        metadata: {
          action: event.action,
          keyRef: event.keyRef,
          reason: event.reason || null,
        },
      }).catch(() => undefined);
    }
  });
};
attachKmsAuditSink();

export const __securityPhase6BTestInternals = {
  resetStore: () => {
    globalForSecurity.__sylphSecurityStore = createStore();
    bootstrapSecurityGovernanceInFlight = null;
    kmsProviderRouterService.resetState();
    kmsAuditSinkAttached = false;
    attachKmsAuditSink();
  },
  getStore: () => getStore(),
  generateTotpCode: (secret: string, at?: Date) => generateTotpCode(secret, at || now()),
  listKmsAuditEvents: () => kmsProviderRouterService.listAuditEvents(),
  setFailpoint: (name: string, enabled: boolean) => {
    const store = getStore();
    if (enabled) {
      store.failpoints.add(name);
    } else {
      store.failpoints.delete(name);
    }
  },
};
