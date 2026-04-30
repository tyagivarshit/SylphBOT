import crypto from "crypto";
import {
  type EnvelopeDecryptInput,
  type EnvelopeDecryptResult,
  type EnvelopeEncryptInput,
  type EnvelopeEncryptResult,
  type KMSAuditEvent,
  type KMSProviderAdapter,
  type KMSProviderName,
  type KMSReencryptInput,
  type KMSReencryptResult,
  type KMSRevokeInput,
  type KMSRevokeResult,
  type KMSRotateInput,
  type KMSRotateResult,
} from "./kmsProvider.contract";

const ENVELOPE_PREFIX = "kms::";
const ENVELOPE_VERSION = "kms-envelope-v1";

type EnvelopePayload = {
  v: string;
  provider: KMSProviderName;
  keyId: string;
  keyVersion: number;
  aadHash: string;
  iv: string;
  tag: string;
  ciphertext: string;
  wrappedDek: string;
  wrappedDekIv: string;
  wrappedDekTag: string;
  digest: string;
  issuedAt: string;
};

type KeyVersionState = {
  version: number;
  status: "ACTIVE" | "REVOKED";
  createdAt: Date;
  revokedAt: Date | null;
};

type KeyRingState = {
  keyRef: string;
  provider: KMSProviderName;
  keyId: string;
  currentVersion: number;
  versions: Map<number, KeyVersionState>;
};

type ReplayState = {
  rotateReplay: Map<string, KMSRotateResult>;
};

type KmsRouterState = {
  keyRings: Map<string, KeyRingState>;
  replay: ReplayState;
  auditLedger: Map<string, KMSAuditEvent>;
  auditSink: ((event: KMSAuditEvent) => Promise<void> | void) | null;
};

const globalForKms = globalThis as typeof globalThis & {
  __sylphKmsRouterState?: KmsRouterState;
};

const stableHash = (value: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const toBase64 = (value: Buffer) => value.toString("base64");
const fromBase64 = (value: string) => Buffer.from(value, "base64");

const getMasterSeed = () =>
  String(process.env.KMS_MASTER_SEED || process.env.JWT_SECRET || "kms-local-seed");

const deriveMaterial = (
  provider: KMSProviderName,
  keyId: string,
  version: number,
  purpose: string
) =>
  crypto
    .createHash("sha256")
    .update(`${provider}:${keyId}:${version}:${purpose}:${getMasterSeed()}`)
    .digest();

const encryptAesGcm = (input: {
  key: Buffer;
  plaintext: Buffer;
  aad: string;
}) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", input.key, iv);
  cipher.setAAD(Buffer.from(input.aad));
  const ciphertext = Buffer.concat([cipher.update(input.plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: toBase64(iv),
    tag: toBase64(tag),
    ciphertext: toBase64(ciphertext),
  };
};

const decryptAesGcm = (input: {
  key: Buffer;
  aad: string;
  iv: string;
  tag: string;
  ciphertext: string;
}) => {
  const decipher = crypto.createDecipheriv("aes-256-gcm", input.key, fromBase64(input.iv));
  decipher.setAAD(Buffer.from(input.aad));
  decipher.setAuthTag(fromBase64(input.tag));
  const plaintext = Buffer.concat([
    decipher.update(fromBase64(input.ciphertext)),
    decipher.final(),
  ]);
  return plaintext;
};

const createProviderAdapter = (provider: KMSProviderName): KMSProviderAdapter => ({
  provider,
  encryptEnvelope: ({ plaintext, keyId, keyVersion, aad }) => {
    const dek = crypto.randomBytes(32);
    const payload = encryptAesGcm({
      key: dek,
      plaintext: Buffer.from(plaintext, "utf8"),
      aad,
    });
    const kek = deriveMaterial(provider, keyId, keyVersion, "kek");
    const wrappedDekPayload = encryptAesGcm({
      key: kek,
      plaintext: dek,
      aad: `wrap:${aad}`,
    });

    return {
      iv: payload.iv,
      tag: payload.tag,
      ciphertext: payload.ciphertext,
      wrappedDek: wrappedDekPayload.ciphertext,
      wrappedDekIv: wrappedDekPayload.iv,
      wrappedDekTag: wrappedDekPayload.tag,
      digest: crypto.createHash("sha256").update(plaintext).digest("hex"),
    };
  },
  decryptEnvelope: ({
    keyId,
    keyVersion,
    aad,
    iv,
    tag,
    ciphertext,
    wrappedDek,
    wrappedDekIv,
    wrappedDekTag,
  }) => {
    const kek = deriveMaterial(provider, keyId, keyVersion, "kek");
    const dek = decryptAesGcm({
      key: kek,
      aad: `wrap:${aad}`,
      iv: wrappedDekIv,
      tag: wrappedDekTag,
      ciphertext: wrappedDek,
    });

    const plaintext = decryptAesGcm({
      key: dek,
      aad,
      iv,
      tag,
      ciphertext,
    });
    const plain = plaintext.toString("utf8");
    return {
      plaintext: plain,
      digest: crypto.createHash("sha256").update(plain).digest("hex"),
    };
  },
});

const providerAdapters: Record<KMSProviderName, KMSProviderAdapter> = {
  AWS_KMS: createProviderAdapter("AWS_KMS"),
  GOOGLE_KMS: createProviderAdapter("GOOGLE_KMS"),
  AZURE_KEY_VAULT: createProviderAdapter("AZURE_KEY_VAULT"),
  LOCAL_FALLBACK: createProviderAdapter("LOCAL_FALLBACK"),
};

const normalizeProvider = (value: unknown): KMSProviderName => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "AWS" || normalized === "AWS_KMS") {
    return "AWS_KMS";
  }
  if (normalized === "GOOGLE" || normalized === "GOOGLE_KMS") {
    return "GOOGLE_KMS";
  }
  if (normalized === "AZURE" || normalized === "AZURE_KEY_VAULT") {
    return "AZURE_KEY_VAULT";
  }
  return "LOCAL_FALLBACK";
};

const resolveDefaultProvider = (): KMSProviderName =>
  normalizeProvider(process.env.KMS_PROVIDER || process.env.SECRET_PROVIDER || "LOCAL_FALLBACK");

const createState = (): KmsRouterState => ({
  keyRings: new Map(),
  replay: {
    rotateReplay: new Map(),
  },
  auditLedger: new Map(),
  auditSink: null,
});

const getState = () => {
  if (!globalForKms.__sylphKmsRouterState) {
    globalForKms.__sylphKmsRouterState = createState();
  }
  return globalForKms.__sylphKmsRouterState;
};

const toKeyRef = (provider: KMSProviderName, keyId: string) =>
  `${provider}:${String(keyId || "").trim().toLowerCase()}`;

const ensureKeyRing = (provider: KMSProviderName, keyId: string) => {
  const normalizedKeyId = String(keyId || "default").trim().toLowerCase() || "default";
  const keyRef = toKeyRef(provider, normalizedKeyId);
  const state = getState();
  const existing = state.keyRings.get(keyRef);
  if (existing) {
    return existing;
  }

  const versionState: KeyVersionState = {
    version: 1,
    status: "ACTIVE",
    createdAt: new Date(),
    revokedAt: null,
  };
  const ring: KeyRingState = {
    keyRef,
    provider,
    keyId: normalizedKeyId,
    currentVersion: 1,
    versions: new Map([[1, versionState]]),
  };
  state.keyRings.set(keyRef, ring);
  return ring;
};

const parseEnvelopePayload = (ciphertext: string): EnvelopePayload => {
  const value = String(ciphertext || "").trim();
  const encoded = value.startsWith(ENVELOPE_PREFIX)
    ? value.slice(ENVELOPE_PREFIX.length)
    : value;

  const decoded = Buffer.from(encoded, "base64url").toString("utf8");
  const payload = JSON.parse(decoded) as EnvelopePayload;
  if (payload.v !== ENVELOPE_VERSION) {
    throw new Error("kms_payload_version_unsupported");
  }
  return payload;
};

const makeAuditEvent = (input: Omit<KMSAuditEvent, "auditKey" | "createdAt">): KMSAuditEvent => {
  const createdAt = new Date();
  return {
    auditKey: `kms_audit:${stableHash([
      input.action,
      input.keyRef,
      input.result,
      input.reason || null,
      createdAt.toISOString(),
      input.secretPath || null,
    ]).slice(0, 24)}`,
    createdAt,
    ...input,
  };
};

const pushAuditEvent = (event: KMSAuditEvent) => {
  const state = getState();
  state.auditLedger.set(event.auditKey, event);
  const sinkOutcome = state.auditSink?.(event);
  if (
    sinkOutcome &&
    typeof (sinkOutcome as Promise<void>).then === "function"
  ) {
    (sinkOutcome as Promise<void>).catch(() => undefined);
  }
};

const toAad = (input: {
  keyRef: string;
  context?: {
    businessId?: string | null;
    tenantId?: string | null;
    secretPath?: string | null;
  } | null;
}) =>
  JSON.stringify({
    keyRef: input.keyRef,
  });

const assertVersionActive = (ring: KeyRingState, version: number) => {
  const versionState = ring.versions.get(version);
  if (!versionState) {
    throw new Error("kms_key_version_not_found");
  }
  if (versionState.status === "REVOKED") {
    throw new Error("kms_key_version_revoked");
  }
  return versionState;
};

const encryptEnvelope = (input: EnvelopeEncryptInput): EnvelopeEncryptResult => {
  const provider = normalizeProvider(input.provider || resolveDefaultProvider());
  const keyId = String(input.keyId || "default").trim().toLowerCase() || "default";
  const ring = ensureKeyRing(provider, keyId);
  const version = ring.currentVersion;
  assertVersionActive(ring, version);
  const keyRef = ring.keyRef;
  const aad = toAad({
    keyRef,
    context: input.context || null,
  });
  const adapter = providerAdapters[provider];

  const encrypted = adapter.encryptEnvelope({
    plaintext: input.plaintext,
    keyId,
    keyVersion: version,
    aad,
  });

  const payload: EnvelopePayload = {
    v: ENVELOPE_VERSION,
    provider,
    keyId,
    keyVersion: version,
    aadHash: crypto.createHash("sha256").update(aad).digest("hex"),
    iv: encrypted.iv,
    tag: encrypted.tag,
    ciphertext: encrypted.ciphertext,
    wrappedDek: encrypted.wrappedDek,
    wrappedDekIv: encrypted.wrappedDekIv,
    wrappedDekTag: encrypted.wrappedDekTag,
    digest: encrypted.digest,
    issuedAt: new Date().toISOString(),
  };

  const serialized = `${ENVELOPE_PREFIX}${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
  pushAuditEvent(
    makeAuditEvent({
      action: "ENCRYPT",
      provider,
      keyId,
      keyVersion: version,
      keyRef,
      businessId: input.context?.businessId || null,
      tenantId: input.context?.tenantId || null,
      secretPath: input.context?.secretPath || null,
      actorId: input.context?.actorId || null,
      result: "ALLOWED",
      reason: input.context?.reason || null,
      metadata: input.context?.metadata || null,
    })
  );

  return {
    ciphertext: serialized,
    keyRef,
    provider,
    keyId,
    keyVersion: version,
    digest: encrypted.digest,
  };
};

const decryptEnvelope = (input: EnvelopeDecryptInput): EnvelopeDecryptResult => {
  const payload = parseEnvelopePayload(input.ciphertext);
  const provider = normalizeProvider(payload.provider);
  const keyId = String(payload.keyId || "").trim().toLowerCase();
  const ring = ensureKeyRing(provider, keyId);
  const keyRef = ring.keyRef;
  assertVersionActive(ring, payload.keyVersion);
  const aad = toAad({
    keyRef,
    context: input.context || null,
  });
  const aadHash = crypto.createHash("sha256").update(aad).digest("hex");
  if (payload.aadHash !== aadHash) {
    pushAuditEvent(
      makeAuditEvent({
        action: "DENIED",
        provider,
        keyId,
        keyVersion: payload.keyVersion,
        keyRef,
        businessId: input.context?.businessId || null,
        tenantId: input.context?.tenantId || null,
        secretPath: input.context?.secretPath || null,
        actorId: input.context?.actorId || null,
        result: "DENIED",
        reason: "kms_aad_mismatch",
        metadata: input.context?.metadata || null,
      })
    );
    throw new Error("kms_aad_mismatch");
  }

  const adapter = providerAdapters[provider];
  const decrypted = adapter.decryptEnvelope({
    keyId,
    keyVersion: payload.keyVersion,
    aad,
    iv: payload.iv,
    tag: payload.tag,
    ciphertext: payload.ciphertext,
    wrappedDek: payload.wrappedDek,
    wrappedDekIv: payload.wrappedDekIv,
    wrappedDekTag: payload.wrappedDekTag,
  });

  pushAuditEvent(
    makeAuditEvent({
      action: "DECRYPT",
      provider,
      keyId,
      keyVersion: payload.keyVersion,
      keyRef,
      businessId: input.context?.businessId || null,
      tenantId: input.context?.tenantId || null,
      secretPath: input.context?.secretPath || null,
      actorId: input.context?.actorId || null,
      result: "ALLOWED",
      reason: input.context?.reason || null,
      metadata: input.context?.metadata || null,
    })
  );

  return {
    plaintext: decrypted.plaintext,
    keyRef,
    provider,
    keyId,
    keyVersion: payload.keyVersion,
    digest: decrypted.digest,
  };
};

const rotateKey = (input: KMSRotateInput): KMSRotateResult => {
  const provider = normalizeProvider(input.provider || resolveDefaultProvider());
  const keyId = String(input.keyId || "default").trim().toLowerCase() || "default";
  const ring = ensureKeyRing(provider, keyId);
  const replayKey = String(input.replayKey || "").trim();
  const replayLookup =
    replayKey &&
    stableHash([
      "rotate",
      ring.keyRef,
      replayKey,
    ]);

  const state = getState();
  if (replayLookup && state.replay.rotateReplay.has(replayLookup)) {
    const replayed = state.replay.rotateReplay.get(replayLookup)!;
    pushAuditEvent(
      makeAuditEvent({
        action: "REPLAY_BLOCKED",
        provider,
        keyId,
        keyVersion: replayed.currentVersion,
        keyRef: ring.keyRef,
        businessId: input.context?.businessId || null,
        tenantId: input.context?.tenantId || null,
        secretPath: input.context?.secretPath || null,
        actorId: input.context?.actorId || null,
        result: "DENIED",
        reason: "kms_rotate_replay_blocked",
        metadata: {
          replayKey,
        },
      })
    );
    return {
      ...replayed,
      replayed: true,
    };
  }

  const previousVersion = ring.currentVersion;
  const currentVersion = previousVersion + 1;
  ring.currentVersion = currentVersion;
  ring.versions.set(currentVersion, {
    version: currentVersion,
    status: "ACTIVE",
    createdAt: new Date(),
    revokedAt: null,
  });

  const result: KMSRotateResult = {
    keyRef: ring.keyRef,
    provider,
    keyId,
    previousVersion,
    currentVersion,
    replayed: false,
  };
  if (replayLookup) {
    state.replay.rotateReplay.set(replayLookup, result);
  }

  pushAuditEvent(
    makeAuditEvent({
      action: "ROTATE",
      provider,
      keyId,
      keyVersion: currentVersion,
      keyRef: ring.keyRef,
      businessId: input.context?.businessId || null,
      tenantId: input.context?.tenantId || null,
      secretPath: input.context?.secretPath || null,
      actorId: input.context?.actorId || null,
      result: "ALLOWED",
      reason: input.reason || null,
      metadata: {
        replayKey: replayKey || null,
        previousVersion,
      },
    })
  );

  return result;
};

const revokeKey = (input: KMSRevokeInput): KMSRevokeResult => {
  const provider = normalizeProvider(input.provider || resolveDefaultProvider());
  const keyId = String(input.keyId || "default").trim().toLowerCase() || "default";
  const ring = ensureKeyRing(provider, keyId);
  const revokedVersions: number[] = [];
  const versions =
    input.version && Number.isFinite(Number(input.version))
      ? [Math.max(1, Math.trunc(Number(input.version)))]
      : Array.from(ring.versions.keys());

  for (const version of versions) {
    const current = ring.versions.get(version);
    if (!current || current.status === "REVOKED") {
      continue;
    }
    current.status = "REVOKED";
    current.revokedAt = new Date();
    revokedVersions.push(version);
  }

  pushAuditEvent(
    makeAuditEvent({
      action: "REVOKE",
      provider,
      keyId,
      keyVersion: input.version || null,
      keyRef: ring.keyRef,
      businessId: input.context?.businessId || null,
      tenantId: input.context?.tenantId || null,
      secretPath: input.context?.secretPath || null,
      actorId: input.context?.actorId || null,
      result: "ALLOWED",
      reason: input.reason,
      metadata: {
        revokedVersions,
      },
    })
  );

  return {
    keyRef: ring.keyRef,
    provider,
    keyId,
    revokedVersions,
  };
};

const reencryptCiphertext = (input: KMSReencryptInput): KMSReencryptResult => {
  const sourcePayload = parseEnvelopePayload(input.ciphertext);
  const sourceKeyRef = toKeyRef(
    normalizeProvider(sourcePayload.provider),
    sourcePayload.keyId
  );
  const decrypted = decryptEnvelope({
    ciphertext: input.ciphertext,
    context: input.context || null,
  });

  const encrypted = encryptEnvelope({
    plaintext: decrypted.plaintext,
    keyId: String(input.targetKeyId || sourcePayload.keyId),
    provider: input.targetProvider || normalizeProvider(sourcePayload.provider),
    context: input.context || null,
  });

  pushAuditEvent(
    makeAuditEvent({
      action: "REENCRYPT",
      provider: encrypted.provider,
      keyId: encrypted.keyId,
      keyVersion: encrypted.keyVersion,
      keyRef: encrypted.keyRef,
      businessId: input.context?.businessId || null,
      tenantId: input.context?.tenantId || null,
      secretPath: input.context?.secretPath || null,
      actorId: input.context?.actorId || null,
      result: "ALLOWED",
      reason: input.context?.reason || "reencrypt_migration",
      metadata: {
        fromKeyRef: sourceKeyRef,
      },
    })
  );

  return {
    ciphertext: encrypted.ciphertext,
    fromKeyRef: sourceKeyRef,
    toKeyRef: encrypted.keyRef,
    migrated: sourceKeyRef !== encrypted.keyRef || sourcePayload.keyVersion !== encrypted.keyVersion,
  };
};

export const registerKmsAuditSink = (
  sink: ((event: KMSAuditEvent) => Promise<void> | void) | null
) => {
  getState().auditSink = sink;
};

export const kmsProviderRouterService = {
  normalizeProvider,
  resolveDefaultProvider,
  encryptEnvelope,
  decryptEnvelope,
  rotateKey,
  revokeKey,
  reencryptCiphertext,
  getKeyRingState: (input: { keyId: string; provider?: KMSProviderName | null }) => {
    const provider = normalizeProvider(input.provider || resolveDefaultProvider());
    const ring = ensureKeyRing(provider, input.keyId);
    return {
      keyRef: ring.keyRef,
      provider: ring.provider,
      keyId: ring.keyId,
      currentVersion: ring.currentVersion,
      versions: Array.from(ring.versions.values()).map((version) => ({
        version: version.version,
        status: version.status,
        createdAt: version.createdAt,
        revokedAt: version.revokedAt,
      })),
    };
  },
  listAuditEvents: () =>
    Array.from(getState().auditLedger.values()).sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
    ),
  resetState: () => {
    globalForKms.__sylphKmsRouterState = createState();
  },
};

export type KmsProviderRouterService = typeof kmsProviderRouterService;
