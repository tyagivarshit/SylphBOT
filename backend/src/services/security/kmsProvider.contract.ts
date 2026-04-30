export type KMSProviderName =
  | "AWS_KMS"
  | "GOOGLE_KMS"
  | "AZURE_KEY_VAULT"
  | "LOCAL_FALLBACK";

export type EnvelopeEncryptionContext = {
  businessId?: string | null;
  tenantId?: string | null;
  secretPath?: string | null;
  actorId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type EnvelopeEncryptInput = {
  plaintext: string;
  keyId: string;
  provider?: KMSProviderName | null;
  context?: EnvelopeEncryptionContext | null;
};

export type EnvelopeDecryptInput = {
  ciphertext: string;
  context?: EnvelopeEncryptionContext | null;
};

export type EnvelopeEncryptResult = {
  ciphertext: string;
  keyRef: string;
  provider: KMSProviderName;
  keyId: string;
  keyVersion: number;
  digest: string;
};

export type EnvelopeDecryptResult = {
  plaintext: string;
  keyRef: string;
  provider: KMSProviderName;
  keyId: string;
  keyVersion: number;
  digest: string;
};

export type KMSRotateInput = {
  keyId: string;
  provider?: KMSProviderName | null;
  replayKey?: string | null;
  reason?: string | null;
  context?: EnvelopeEncryptionContext | null;
};

export type KMSRotateResult = {
  keyRef: string;
  provider: KMSProviderName;
  keyId: string;
  previousVersion: number;
  currentVersion: number;
  replayed: boolean;
};

export type KMSRevokeInput = {
  keyId: string;
  provider?: KMSProviderName | null;
  version?: number | null;
  reason: string;
  context?: EnvelopeEncryptionContext | null;
};

export type KMSRevokeResult = {
  keyRef: string;
  provider: KMSProviderName;
  keyId: string;
  revokedVersions: number[];
};

export type KMSReencryptInput = {
  ciphertext: string;
  targetKeyId?: string | null;
  targetProvider?: KMSProviderName | null;
  context?: EnvelopeEncryptionContext | null;
};

export type KMSReencryptResult = {
  ciphertext: string;
  fromKeyRef: string;
  toKeyRef: string;
  migrated: boolean;
};

export type KMSAuditEvent = {
  auditKey: string;
  action:
    | "ENCRYPT"
    | "DECRYPT"
    | "ROTATE"
    | "REVOKE"
    | "REENCRYPT"
    | "REPLAY_BLOCKED"
    | "DENIED";
  provider: KMSProviderName;
  keyId: string;
  keyVersion?: number | null;
  keyRef: string;
  businessId?: string | null;
  tenantId?: string | null;
  secretPath?: string | null;
  actorId?: string | null;
  result: "ALLOWED" | "DENIED";
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
};

export type KMSProviderAdapter = {
  provider: KMSProviderName;
  encryptEnvelope: (input: {
    plaintext: string;
    keyId: string;
    keyVersion: number;
    aad: string;
  }) => {
    iv: string;
    tag: string;
    ciphertext: string;
    wrappedDek: string;
    wrappedDekIv: string;
    wrappedDekTag: string;
    digest: string;
  };
  decryptEnvelope: (input: {
    keyId: string;
    keyVersion: number;
    aad: string;
    iv: string;
    tag: string;
    ciphertext: string;
    wrappedDek: string;
    wrappedDekIv: string;
    wrappedDekTag: string;
  }) => {
    plaintext: string;
    digest: string;
  };
};

