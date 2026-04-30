import assert from "node:assert/strict";
import {
  __securityPhase6BTestInternals,
  applyLegalHold,
  approvePrivilegeEscalation,
  authorizeAccess,
  bootstrapSecurityGovernanceOS,
  createPolicyVersion,
  issueSessionLedger,
  markDeletionCompleted,
  markExportCompleted,
  recordFraudSignal,
  recordWebhookSpoofAttempt,
  requestDeletion,
  requestExport,
  requestPrivilegeEscalation,
  rotateKmsBoundaryKey,
  revokeIdentitySessions,
  revokeKmsKeyCascade,
  revokeTrustedDevice,
  rollbackPolicyVersion,
  runSecretReencryptMigration,
  runSecurityFailureInjectionScenario,
  runSecurityGovernanceSelfAudit,
  createMFAChallenge,
  provisionMFAForIdentity,
  verifyMFAChallengeBackupCode,
  verifyMFAChallengeTOTP,
  attestInfraIsolation,
  trackSessionAnomaly,
  upsertSecretInVault,
  writePIIVaultRecord,
  assertTenantIsolation,
  releaseLegalHold,
} from "../services/security/securityGovernanceOS.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const reset = async () => {
  __securityPhase6BTestInternals.resetStore();
  await bootstrapSecurityGovernanceOS();
};

const getStore = () => __securityPhase6BTestInternals.getStore();

export const securityPhase6BTests: TestCase[] = [
  {
    name: "phase6b privilege escalation replay is blocked after first consume",
    run: async () => {
      await reset();
      const request = await requestPrivilegeEscalation({
        businessId: "business_1",
        tenantId: "business_1",
        userId: "user_1",
        permission: "compliance:delete",
        reason: "approved destructive operation",
      });
      await approvePrivilegeEscalation({
        escalationKey: request.escalationKey,
        approvedBy: "owner_1",
      });

      const first = await authorizeAccess({
        action: "compliance:delete",
        businessId: "business_1",
        tenantId: "business_1",
        actorId: "user_1",
        actorType: "USER",
        role: "OWNER",
        mfaVerified: true,
        approvalToken: request.approvalToken,
      });
      const second = await authorizeAccess({
        action: "compliance:delete",
        businessId: "business_1",
        tenantId: "business_1",
        actorId: "user_1",
        actorType: "USER",
        role: "OWNER",
        mfaVerified: true,
        approvalToken: request.approvalToken,
      });

      assert.equal(first.allowed, true);
      assert.equal(second.allowed, false);
      assert.equal(second.reason, "token_replay_detected");
    },
  },
  {
    name: "phase6b cross tenant bleed detection blocks mismatched tenant access",
    run: async () => {
      await reset();
      const isolation = await assertTenantIsolation({
        businessId: "tenant_A",
        tenantId: "tenant_A",
        actorTenantId: "tenant_A",
        resourceTenantId: "tenant_B",
        subsystem: "BOOKING",
      });

      assert.equal(isolation.allowed, false);
      assert.equal(isolation.reason, "cross_tenant_bleed_blocked");
    },
  },
  {
    name: "phase6b secret rotation ledger tracks replay-safe version lineage",
    run: async () => {
      await reset();
      const first = await upsertSecretInVault({
        businessId: "business_1",
        tenantId: "business_1",
        secretName: "stripe_signing_secret",
        secretValue: "secret_v1",
        provider: "STRIPE",
        credentialType: "SIGNING_SECRET",
      });
      const second = await upsertSecretInVault({
        businessId: "business_1",
        tenantId: "business_1",
        secretName: "stripe_signing_secret",
        secretValue: "secret_v2",
        provider: "STRIPE",
        credentialType: "SIGNING_SECRET",
      });

      assert.equal(first.currentVersion, 1);
      assert.equal(second.currentVersion, 2);
      assert.ok(getStore().keyRotationLedger.size >= 1);
    },
  },
  {
    name: "phase6b revocation cascade revokes all active sessions for identity",
    run: async () => {
      await reset();
      await issueSessionLedger({
        businessId: "business_1",
        tenantId: "business_1",
        userId: "user_1",
        sessionKey: "session_1",
      });
      await issueSessionLedger({
        businessId: "business_1",
        tenantId: "business_1",
        userId: "user_1",
        sessionKey: "session_2",
      });

      const revoked = await revokeIdentitySessions({
        businessId: "business_1",
        userId: "user_1",
        reason: "token_theft_containment",
      });

      assert.equal(revoked.revokedSessionKeys.length, 2);
      assert.equal(
        Array.from(getStore().sessionLedger.values()).every(
          (row) => row.status === "REVOKED"
        ),
        true
      );
    },
  },
  {
    name: "phase6b pii export policy requires purpose and records approved export",
    run: async () => {
      await reset();
      await assert.rejects(async () => {
        await requestExport({
          businessId: "business_1",
          tenantId: "business_1",
          requestedBy: "user_1",
          purpose: null,
          autoApprove: true,
        });
      });

      await writePIIVaultRecord({
        businessId: "business_1",
        tenantId: "business_1",
        dataSubjectId: "lead_1",
        entityType: "LEAD",
        entityId: "lead_1",
        fieldName: "email",
        rawValue: "lead@example.com",
        classification: "PII_SENSITIVE",
        purpose: "BUSINESS_ANALYTICS",
      });

      const approved = await requestExport({
        businessId: "business_1",
        tenantId: "business_1",
        requestedBy: "user_1",
        purpose: "GDPR_EXPORT",
        autoApprove: true,
      });
      assert.equal(approved.status, "APPROVED");

      const completed = await markExportCompleted({
        exportRequestKey: approved.exportRequestKey,
        artifactRef: "export://business_1/archive_1",
      });

      assert.equal(completed?.status, "COMPLETED");
      assert.equal(getStore().piiVaultLedger.size, 1);
    },
  },
  {
    name: "phase6b delete request flow transitions approved request to completed",
    run: async () => {
      await reset();
      const request = await requestDeletion({
        businessId: "business_1",
        tenantId: "business_1",
        requestedBy: "owner_1",
        mode: "soft",
      });
      assert.equal(request.status, "APPROVED");
      const completed = await markDeletionCompleted({
        deletionRequestKey: request.deletionRequestKey,
      });
      assert.equal(completed?.status, "COMPLETED");
    },
  },
  {
    name: "phase6b legal hold blocks delete until explicit release",
    run: async () => {
      await reset();
      const hold = await applyLegalHold({
        businessId: "business_1",
        tenantId: "business_1",
        caseRef: "case-77",
        reason: "payment dispute preservation",
        requestedBy: "legal_1",
      });
      const blocked = await requestDeletion({
        businessId: "business_1",
        tenantId: "business_1",
        requestedBy: "owner_1",
        mode: "permanent",
      });
      assert.equal(blocked.status, "BLOCKED_LEGAL_HOLD");

      await releaseLegalHold({
        legalHoldKey: hold.legalHoldKey,
        releasedBy: "legal_1",
      });
      const approved = await requestDeletion({
        businessId: "business_1",
        tenantId: "business_1",
        requestedBy: "owner_1",
        mode: "permanent",
      });
      assert.equal(approved.status, "APPROVED");
    },
  },
  {
    name: "phase6b fraud containment triggers incident on credential stuffing threshold",
    run: async () => {
      await reset();
      let final: any = null;
      for (let index = 0; index < 5; index += 1) {
        final = await recordFraudSignal({
          businessId: "business_1",
          tenantId: "business_1",
          signalType: "credential_stuffing",
          actorId: "user_1",
          severity: "MEDIUM",
        });
      }
      assert.ok(final);
      assert.equal(final.status, "CONTAINED");
      assert.ok(getStore().securityIncidentLedger.size >= 1);
    },
  },
  {
    name: "phase6b token theft containment revokes sessions and freezes tenant",
    run: async () => {
      await reset();
      await issueSessionLedger({
        businessId: "business_1",
        tenantId: "business_1",
        userId: "user_1",
        sessionKey: "session_token_theft",
      });
      const signal = await recordFraudSignal({
        businessId: "business_1",
        tenantId: "business_1",
        signalType: "token_theft",
        actorId: "user_1",
        sessionKey: "session_token_theft",
        severity: "HIGH",
      });
      assert.equal(signal.status, "CONTAINED");
      assert.equal(
        getStore().sessionLedger.get("session_token_theft")?.status,
        "REVOKED"
      );
      assert.equal(getStore().frozenTenants.has("business_1"), true);
    },
  },
  {
    name: "phase6b webhook spoof containment installs temporary webhook deny override",
    run: async () => {
      await reset();
      const signal = await recordWebhookSpoofAttempt({
        businessId: "business_1",
        tenantId: "business_1",
        provider: "INSTAGRAM",
        signature: "sha256=spoof",
        reason: "invalid_signature",
      });
      assert.equal(signal.status, "CONTAINED");
      assert.equal(
        Array.from(getStore().securityOverrideLedger.values()).some(
          (row) => row.scope === "WEBHOOK" && row.action === "DENY"
        ),
        true
      );
    },
  },
  {
    name: "phase6b session anomaly scoring locks session at threshold",
    run: async () => {
      await reset();
      await issueSessionLedger({
        businessId: "business_1",
        tenantId: "business_1",
        userId: "user_1",
        sessionKey: "session_anomaly_1",
        ip: "1.1.1.1",
        userAgent: "ua_1",
        deviceId: "device_A",
      });
      const result = await trackSessionAnomaly({
        sessionKey: "session_anomaly_1",
        businessId: "business_1",
        tenantId: "business_1",
        userId: "user_1",
        ip: "8.8.8.8",
        userAgent: "ua_2",
        deviceId: "device_B",
      });
      assert.equal(result.locked, true);
      assert.equal(["LOCKED", "REVOKED"].includes(result.status), true);
    },
  },
  {
    name: "phase6b mfa replay blocks second authorization consume for same challenge",
    run: async () => {
      await reset();
      const enrollment = await provisionMFAForIdentity({
        businessId: "business_1",
        tenantId: "business_1",
        userId: "user_1",
      });
      await issueSessionLedger({
        businessId: "business_1",
        tenantId: "business_1",
        userId: "user_1",
        sessionKey: "session_mfa_replay_1",
        deviceId: "device_mfa_1",
      });
      const challenge = await createMFAChallenge({
        businessId: "business_1",
        tenantId: "business_1",
        userId: "user_1",
        sessionKey: "session_mfa_replay_1",
        action: "security:manage",
        deviceId: "device_mfa_1",
      });
      const totpCode = __securityPhase6BTestInternals.generateTotpCode(
        enrollment.totpSecret
      );
      const verified = await verifyMFAChallengeTOTP({
        challengeKey: challenge.challengeKey,
        totpCode,
        trustDevice: true,
        deviceId: "device_mfa_1",
      });
      assert.equal(verified.verified, true);

      const first = await authorizeAccess({
        action: "security:manage",
        businessId: "business_1",
        tenantId: "business_1",
        actorId: "user_1",
        actorType: "USER",
        role: "OWNER",
        sessionKey: "session_mfa_replay_1",
        deviceId: "device_mfa_1",
        mfaChallengeKey: challenge.challengeKey,
      });
      const second = await authorizeAccess({
        action: "security:manage",
        businessId: "business_1",
        tenantId: "business_1",
        actorId: "user_1",
        actorType: "USER",
        role: "OWNER",
        sessionKey: "session_mfa_replay_1",
        deviceId: "device_mfa_1",
        mfaChallengeKey: challenge.challengeKey,
      });
      assert.equal(first.allowed, true);
      assert.equal(second.allowed, false);
      assert.equal(second.reason, "mfa_challenge_replay");
    },
  },
  {
    name: "phase6b trusted device revoke removes step-up bypass path",
    run: async () => {
      await reset();
      const enrollment = await provisionMFAForIdentity({
        businessId: "business_1",
        tenantId: "business_1",
        userId: "user_1",
      });
      const challenge = await createMFAChallenge({
        businessId: "business_1",
        tenantId: "business_1",
        userId: "user_1",
        action: "security:manage",
        deviceId: "device_revoke_1",
      });
      const totpCode = __securityPhase6BTestInternals.generateTotpCode(
        enrollment.totpSecret
      );
      await verifyMFAChallengeTOTP({
        challengeKey: challenge.challengeKey,
        totpCode,
        trustDevice: true,
        deviceId: "device_revoke_1",
      });

      await revokeTrustedDevice({
        businessId: "business_1",
        tenantId: "business_1",
        userId: "user_1",
        deviceId: "device_revoke_1",
        reason: "device_compromised",
      });

      const access = await authorizeAccess({
        action: "security:manage",
        businessId: "business_1",
        tenantId: "business_1",
        actorId: "user_1",
        actorType: "USER",
        role: "OWNER",
        mfaVerified: true,
        deviceId: "device_revoke_1",
      });
      assert.equal(access.allowed, false);
      assert.equal(access.reason, "trusted_device_required");
    },
  },
  {
    name: "phase6b backup code burn blocks replayed backup code on second use",
    run: async () => {
      await reset();
      const enrollment = await provisionMFAForIdentity({
        businessId: "business_1",
        tenantId: "business_1",
        userId: "user_1",
      });
      const backupCode = enrollment.backupCodes[0];
      const firstChallenge = await createMFAChallenge({
        businessId: "business_1",
        tenantId: "business_1",
        userId: "user_1",
        action: "security:manage",
      });
      const first = await verifyMFAChallengeBackupCode({
        challengeKey: firstChallenge.challengeKey,
        backupCode,
      });
      assert.equal(first.verified, true);

      const secondChallenge = await createMFAChallenge({
        businessId: "business_1",
        tenantId: "business_1",
        userId: "user_1",
        action: "security:manage",
      });
      const second = await verifyMFAChallengeBackupCode({
        challengeKey: secondChallenge.challengeKey,
        backupCode,
      });
      assert.equal(second.verified, false);
      assert.equal(second.reason, "backup_code_invalid");
      assert.equal(
        Array.from(getStore().recoveryLedger.values()).some(
          (row) => row.status === "BURNED"
        ),
        true
      );
    },
  },
  {
    name: "phase6b kms rotate replay keeps deterministic version without double-rotation",
    run: async () => {
      await reset();
      const first = await rotateKmsBoundaryKey({
        businessId: "business_1",
        tenantId: "business_1",
        keyId: "secos:business_1:secret_test",
        provider: "LOCAL_FALLBACK",
        replayKey: "rotate-once",
        actorId: "owner_1",
      });
      const second = await rotateKmsBoundaryKey({
        businessId: "business_1",
        tenantId: "business_1",
        keyId: "secos:business_1:secret_test",
        provider: "LOCAL_FALLBACK",
        replayKey: "rotate-once",
        actorId: "owner_1",
      });
      assert.equal(first.currentVersion, 2);
      assert.equal(second.currentVersion, 2);
      assert.equal(second.replayed, true);
    },
  },
  {
    name: "phase6b key revoke cascade revokes dependent secret and credential records",
    run: async () => {
      await reset();
      const secret = await upsertSecretInVault({
        businessId: "business_1",
        tenantId: "business_1",
        secretName: "provider:stripe:access_token",
        secretValue: "secret_live_access_1",
        provider: "STRIPE",
        credentialType: "ACCESS_TOKEN",
      });
      const keyRef = String(secret.metadata?.kmsKeyRef || "");
      const revoke = await revokeKmsKeyCascade({
        businessId: "business_1",
        tenantId: "business_1",
        keyRef,
        reason: "provider_compromise",
        actorId: "security_1",
      });
      assert.ok(revoke.affectedSecrets.includes(secret.secretKey));
      const secretRow = getStore().secretLedger.get(secret.secretKey);
      assert.equal(secretRow?.status, "REVOKED");
      assert.equal(
        Array.from(getStore().credentialVaultLedger.values()).some(
          (row) => row.secretKey === secret.secretKey && row.status === "REVOKED"
        ),
        true
      );
    },
  },
  {
    name: "phase6b reencrypt migration rewraps ciphertext after boundary key rotation",
    run: async () => {
      await reset();
      const first = await upsertSecretInVault({
        businessId: "business_1",
        tenantId: "business_1",
        secretName: "migration_secret",
        secretValue: "secret_v1",
        provider: "INTERNAL",
        credentialType: "TEST",
      });
      const keyRef = String(first.metadata?.kmsKeyRef || "");
      const [provider, keyId] = keyRef.split(":");
      await rotateKmsBoundaryKey({
        businessId: "business_1",
        tenantId: "business_1",
        provider,
        keyId,
        replayKey: "migration_rotate",
      });

      const beforeCipher = String(
        getStore().secretLedger.get(first.secretKey)?.encryptedRef || ""
      );
      const migration = await runSecretReencryptMigration({
        businessId: "business_1",
        tenantId: "business_1",
        keyRef,
        actorId: "owner_1",
      });
      const afterCipher = String(
        getStore().secretLedger.get(first.secretKey)?.encryptedRef || ""
      );
      assert.equal(migration.migrated, 1);
      assert.notEqual(beforeCipher, afterCipher);
    },
  },
  {
    name: "phase6b attestation breach opens incident and contains tenant runtime",
    run: async () => {
      await reset();
      const attestation = await attestInfraIsolation({
        businessId: "business_1",
        tenantId: "business_1",
        source: "TEST",
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
      });
      assert.equal(attestation.verdict, "BREACH");
      assert.equal(attestation.contained, true);
      assert.equal(getStore().frozenTenants.has("business_1"), true);
      assert.ok(getStore().securityIncidentLedger.size >= 1);
    },
  },
  {
    name: "phase6b cross-tenant containment freezes tenant after bleed detection",
    run: async () => {
      await reset();
      await assertTenantIsolation({
        businessId: "tenant_A",
        tenantId: "tenant_A",
        actorTenantId: "tenant_A",
        resourceTenantId: "tenant_B",
        subsystem: "BILLING",
      });

      const access = await authorizeAccess({
        action: "messages:enqueue",
        businessId: "tenant_A",
        tenantId: "tenant_A",
        actorId: "service_1",
        actorType: "SERVICE",
        role: "SERVICE",
        permissions: ["messages:enqueue"],
        scopes: ["WRITE"],
      });
      assert.equal(access.allowed, false);
      assert.equal(access.reason, "tenant_frozen");
    },
  },
  {
    name: "phase6b failure injection detects kms encryption outage and contains incident",
    run: async () => {
      await reset();
      const outcome = await runSecurityFailureInjectionScenario({
        businessId: "business_1",
        scenario: "kms_encrypt_failure",
      });
      assert.equal(outcome.failed, true);
      assert.equal(outcome.contained, true);
      assert.ok(getStore().securityIncidentLedger.size >= 1);
    },
  },
  {
    name: "phase6b policy rollback restores previous access behavior deterministically",
    run: async () => {
      await reset();

      await createPolicyVersion({
        policyDomain: "ACCESS",
        businessId: "business_1",
        createdBy: "owner_1",
        activate: true,
        rules: {
          allowedHoursUtcStart: 0,
          allowedHoursUtcEnd: 23,
          sensitiveMfaActions: ["security:manage"],
          escalationRequiredActions: ["compliance:delete"],
          scopeRules: {
            "messages:enqueue": ["WRITE", "ADMIN"],
          },
          servicePrincipals: ["SYSTEM", "WORKER", "WEBHOOK", "SERVICE"],
          maxSessionAnomalyScore: 2.5,
        },
      });

      await createPolicyVersion({
        policyDomain: "ACCESS",
        businessId: "business_1",
        createdBy: "owner_1",
        activate: true,
        rules: {
          allowedHoursUtcStart: 23,
          allowedHoursUtcEnd: 23,
          sensitiveMfaActions: ["security:manage"],
          escalationRequiredActions: ["compliance:delete"],
          scopeRules: {
            "messages:enqueue": ["WRITE", "ADMIN"],
          },
          servicePrincipals: ["SYSTEM", "WORKER", "WEBHOOK", "SERVICE"],
          maxSessionAnomalyScore: 2.5,
        },
      });

      const denied = await authorizeAccess({
        action: "messages:enqueue",
        businessId: "business_1",
        tenantId: "business_1",
        actorId: "service_1",
        actorType: "SERVICE",
        role: "SERVICE",
        permissions: ["messages:enqueue"],
        scopes: ["WRITE"],
        requestTime: new Date("2026-01-01T12:00:00.000Z"),
      });
      assert.equal(denied.allowed, false);

      await rollbackPolicyVersion({
        policyDomain: "ACCESS",
        businessId: "business_1",
        toVersion: 1,
        actorId: "owner_1",
      });

      const allowed = await authorizeAccess({
        action: "messages:enqueue",
        businessId: "business_1",
        tenantId: "business_1",
        actorId: "service_1",
        actorType: "SERVICE",
        role: "SERVICE",
        permissions: ["messages:enqueue"],
        scopes: ["WRITE"],
        requestTime: new Date("2026-01-01T12:00:00.000Z"),
      });
      assert.equal(allowed.allowed, true);
    },
  },
  {
    name: "phase6b failure injection opens contained incident with no silent bypass",
    run: async () => {
      await reset();
      const outcome = await runSecurityFailureInjectionScenario({
        businessId: "business_1",
        scenario: "vault_write_failure",
      });
      assert.equal(outcome.failed, true);
      assert.equal(outcome.contained, true);
      assert.ok(getStore().securityIncidentLedger.size >= 1);
    },
  },
  {
    name: "phase6b self audit confirms deep wiring posture",
    run: async () => {
      await reset();
      await authorizeAccess({
        action: "messages:enqueue",
        businessId: "business_1",
        tenantId: "business_1",
        actorId: "service_1",
        actorType: "SERVICE",
        role: "SERVICE",
        permissions: ["messages:enqueue"],
        scopes: ["WRITE"],
      });
      const audit = await runSecurityGovernanceSelfAudit({
        businessId: "business_1",
      });
      assert.equal(audit.deeplyWired, true);
      assert.equal(audit.checks.bootstrapped, true);
      assert.equal(audit.checks.authoritative, true);
    },
  },
];
