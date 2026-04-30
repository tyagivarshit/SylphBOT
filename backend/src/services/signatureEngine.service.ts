import { Prisma, SignatureStatus } from "@prisma/client";
import prisma from "../config/prisma";
import { publishCommerceEvent } from "./commerceEvent.service";
import { contractEngineService } from "./contractEngine.service";
import { invoiceEngineService } from "./invoiceEngine.service";
import {
  SIGNATURE_TRANSITIONS,
  assertTransition,
  buildDeterministicDigest,
  buildLedgerKey,
  mergeMetadata,
  normalizeProvider,
} from "./commerce/shared";

export const createSignatureEngineService = () => {
  const requestSignature = async ({
    businessId,
    contractKey,
    signerEmail,
    signerName = null,
    signerRole = "AUTHORIZED_SIGNER",
    provider = "INTERNAL",
    expiresInHours = 72,
    metadata = null,
    idempotencyKey = null,
  }: {
    businessId: string;
    contractKey: string;
    signerEmail: string;
    signerName?: string | null;
    signerRole?: string;
    provider?: string;
    expiresInHours?: number;
    metadata?: Record<string, unknown> | null;
    idempotencyKey?: string | null;
  }) => {
    const normalizedIdempotency =
      String(idempotencyKey || "").trim() ||
      buildDeterministicDigest({
        businessId,
        contractKey,
        signerEmail: String(signerEmail || "").trim().toLowerCase(),
      });

    const existing = await prisma.signatureLedger.findUnique({
      where: {
        idempotencyKey: normalizedIdempotency,
      },
    });

    if (existing) {
      return existing;
    }

    return prisma.$transaction(async (tx) => {
      const contract = await tx.contractLedger.findFirst({
        where: {
          businessId,
          contractKey,
        },
      });

      if (!contract) {
        throw new Error("contract_not_found");
      }

      if (["CANCELLED", "EXPIRED"].includes(contract.status)) {
        throw new Error(`contract_not_signable:${contract.status}`);
      }

      const expiresAt = new Date(Date.now() + Math.max(1, expiresInHours) * 60 * 60 * 1000);

      const signature = await tx.signatureLedger.create({
        data: {
          businessId,
          contractId: contract.id,
          signatureKey: buildLedgerKey("signature"),
          status: "PENDING",
          signerEmail: String(signerEmail || "").trim().toLowerCase(),
          signerName,
          signerRole,
          provider: normalizeProvider(provider),
          expiresAt,
          idempotencyKey: normalizedIdempotency,
          metadata: mergeMetadata(
            {
              contractKey,
            },
            metadata || undefined
          ) as Prisma.InputJsonValue,
        },
      });

      await publishCommerceEvent({
        tx,
        event: "commerce.signature.requested",
        businessId,
        aggregateType: "signature_ledger",
        aggregateId: signature.id,
        eventKey: signature.signatureKey,
        payload: {
          businessId,
          contractId: contract.id,
          contractKey,
          signatureId: signature.id,
          signatureKey: signature.signatureKey,
          signerEmail: signature.signerEmail,
          expiresAt: signature.expiresAt?.toISOString() || null,
        },
      });

      return signature;
    });
  };

  const transitionSignatureStatus = async ({
    businessId,
    signatureKey,
    nextStatus,
    providerSignatureId = null,
    metadata = null,
  }: {
    businessId: string;
    signatureKey: string;
    nextStatus: SignatureStatus;
    providerSignatureId?: string | null;
    metadata?: Record<string, unknown> | null;
  }) => {
    const signature = await prisma.signatureLedger.findFirst({
      where: {
        businessId,
        signatureKey,
      },
    });

    if (!signature) {
      throw new Error("signature_not_found");
    }

    assertTransition({
      current: signature.status,
      next: nextStatus,
      transitions: SIGNATURE_TRANSITIONS,
      scope: "signature",
    });

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.signatureLedger.update({
        where: {
          id: signature.id,
        },
        data: {
          status: nextStatus,
          providerSignatureId:
            String(providerSignatureId || "").trim() || signature.providerSignatureId,
          signedAt: nextStatus === "SIGNED" ? new Date() : signature.signedAt,
          declinedAt: nextStatus === "DECLINED" ? new Date() : signature.declinedAt,
          metadata: mergeMetadata(signature.metadata, metadata || undefined) as Prisma.InputJsonValue,
        },
      });

      await publishCommerceEvent({
        tx,
        event: "commerce.signature.status_changed",
        businessId,
        aggregateType: "signature_ledger",
        aggregateId: updated.id,
        eventKey: `${signatureKey}:${signature.status}:${nextStatus}`,
        payload: {
          businessId,
          signatureId: updated.id,
          signatureKey,
          contractId: updated.contractId,
          from: signature.status,
          to: nextStatus,
          providerSignatureId: updated.providerSignatureId,
        },
      });

      if (nextStatus === "SIGNED") {
        const allSignatures = await tx.signatureLedger.findMany({
          where: {
            contractId: updated.contractId,
          },
        });

        const pending = allSignatures.some((row) => row.status !== "SIGNED");

        if (!pending) {
          const contract = await tx.contractLedger.findUnique({
            where: {
              id: updated.contractId,
            },
          });

          if (contract && contract.status !== "SIGNED" && contract.status !== "ACTIVATED") {
            await tx.contractLedger.update({
              where: {
                id: contract.id,
              },
              data: {
                status: "SIGNED",
                signedAt: new Date(),
                metadata: mergeMetadata(contract.metadata, {
                  signedViaSignatureLedger: true,
                }) as Prisma.InputJsonValue,
              },
            });

            await publishCommerceEvent({
              tx,
              event: "commerce.contract.status_changed",
              businessId,
              aggregateType: "contract_ledger",
              aggregateId: contract.id,
              eventKey: `${contract.contractKey}:auto_signed`,
              payload: {
                businessId,
                contractId: contract.id,
                contractKey: contract.contractKey,
                from: contract.status,
                to: "SIGNED",
                reason: "all_signatures_completed",
              },
            });
          }
        }
      }

      return updated;
    });

    if (nextStatus === "SIGNED") {
      const contract = await prisma.contractLedger.findUnique({
        where: {
          id: updated.contractId,
        },
      });

      if (contract && contract.status === "SIGNED") {
        await contractEngineService
          .activateContract({
            businessId,
            contractKey: contract.contractKey,
            activatedBy: "SYSTEM",
          })
          .catch(() => undefined);

        await invoiceEngineService
          .issueInvoice({
            businessId,
            contractKey: contract.contractKey,
            dueDays: 0,
            idempotencyKey: `invoice:contract_activation:${contract.id}`,
            metadata: {
              source: "signature_auto_activation",
            },
          })
          .catch(() => undefined);
      }
    }

    return updated;
  };

  const markSigned = async ({
    businessId,
    signatureKey,
    providerSignatureId = null,
    metadata = null,
  }: {
    businessId: string;
    signatureKey: string;
    providerSignatureId?: string | null;
    metadata?: Record<string, unknown> | null;
  }) =>
    transitionSignatureStatus({
      businessId,
      signatureKey,
      nextStatus: "SIGNED",
      providerSignatureId,
      metadata,
    });

  const markDeclined = async ({
    businessId,
    signatureKey,
    metadata = null,
  }: {
    businessId: string;
    signatureKey: string;
    metadata?: Record<string, unknown> | null;
  }) =>
    transitionSignatureStatus({
      businessId,
      signatureKey,
      nextStatus: "DECLINED",
      metadata,
    });

  const replaySignature = async ({
    businessId,
    signatureKey,
    replayedFromSignatureId,
  }: {
    businessId: string;
    signatureKey: string;
    replayedFromSignatureId: string;
  }) => {
    const signature = await prisma.signatureLedger.findFirst({
      where: {
        businessId,
        signatureKey,
      },
    });

    if (!signature) {
      throw new Error("signature_not_found");
    }

    return prisma.signatureLedger.update({
      where: {
        id: signature.id,
      },
      data: {
        metadata: mergeMetadata(signature.metadata, {
          replayedFromSignatureId,
          replayedAt: new Date().toISOString(),
        }) as Prisma.InputJsonValue,
      },
    });
  };

  const activateContractAfterSign = async ({
    businessId,
    contractKey,
  }: {
    businessId: string;
    contractKey: string;
  }) =>
    contractEngineService.activateContract({
      businessId,
      contractKey,
      activatedBy: "SYSTEM",
    });

  return {
    requestSignature,
    transitionSignatureStatus,
    markSigned,
    markDeclined,
    replaySignature,
    activateContractAfterSign,
  };
};

export const signatureEngineService = createSignatureEngineService();
