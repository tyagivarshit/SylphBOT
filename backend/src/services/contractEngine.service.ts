import { ContractStatus, Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { publishCommerceEvent } from "./commerceEvent.service";
import {
  CONTRACT_TRANSITIONS,
  PROPOSAL_TRANSITIONS,
  assertTransition,
  buildLedgerKey,
  mergeMetadata,
  normalizeActor,
} from "./commerce/shared";

export const createContractEngineService = () => {
  const generateFromProposal = async ({
    businessId,
    proposalKey,
    templateKey = "MASTER_SERVICES_AGREEMENT_V1",
    templateVersion = "v1",
    source = "SYSTEM",
    metadata = null,
    idempotencyKey = null,
  }: {
    businessId: string;
    proposalKey: string;
    templateKey?: string;
    templateVersion?: string;
    source?: string;
    metadata?: Record<string, unknown> | null;
    idempotencyKey?: string | null;
  }) => {
    const normalizedIdempotency = String(idempotencyKey || "").trim() || null;

    if (normalizedIdempotency) {
      const existing = await prisma.contractLedger.findUnique({
        where: {
          idempotencyKey: normalizedIdempotency,
        },
      });

      if (existing) {
        return existing;
      }
    }

    return prisma.$transaction(async (tx) => {
      const proposal = await tx.proposalLedger.findFirst({
        where: {
          businessId,
          proposalKey,
        },
      });

      if (!proposal) {
        throw new Error("proposal_not_found");
      }

      const existing = await tx.contractLedger.findFirst({
        where: {
          businessId,
          proposalId: proposal.id,
        },
      });

      if (existing) {
        return existing;
      }

      if (!["ACCEPTED", "CONTRACT_GENERATED"].includes(proposal.status)) {
        throw new Error(`proposal_not_accepted:${proposal.status}`);
      }

      const contract = await tx.contractLedger.create({
        data: {
          businessId,
          proposalId: proposal.id,
          contractKey: buildLedgerKey("contract"),
          status: "GENERATED",
          source: normalizeActor(source),
          templateKey,
          templateVersion,
          metadata: mergeMetadata(
            {
              proposalKey,
            },
            metadata || undefined
          ) as Prisma.InputJsonValue,
          idempotencyKey: normalizedIdempotency,
        },
      });

      assertTransition({
        current: proposal.status,
        next: "CONTRACT_GENERATED",
        transitions: PROPOSAL_TRANSITIONS,
        scope: "proposal",
      });

      await tx.proposalLedger.update({
        where: {
          id: proposal.id,
        },
        data: {
          status: "CONTRACT_GENERATED",
          contractGeneratedAt: new Date(),
          metadata: mergeMetadata(proposal.metadata, {
            contractKey: contract.contractKey,
            contractId: contract.id,
          }) as Prisma.InputJsonValue,
        },
      });

      await publishCommerceEvent({
        tx,
        event: "commerce.contract.generated",
        businessId,
        aggregateType: "contract_ledger",
        aggregateId: contract.id,
        eventKey: contract.contractKey,
        payload: {
          businessId,
          proposalId: proposal.id,
          proposalKey,
          contractId: contract.id,
          contractKey: contract.contractKey,
          status: contract.status,
          templateKey,
          templateVersion,
        },
      });

      return contract;
    });
  };

  const transitionContractStatus = async ({
    businessId,
    contractKey,
    nextStatus,
    metadata,
  }: {
    businessId: string;
    contractKey: string;
    nextStatus: ContractStatus;
    metadata?: Record<string, unknown> | null;
  }) => {
    const contract = await prisma.contractLedger.findFirst({
      where: {
        businessId,
        contractKey,
      },
    });

    if (!contract) {
      throw new Error("contract_not_found");
    }

    assertTransition({
      current: contract.status,
      next: nextStatus,
      transitions: CONTRACT_TRANSITIONS,
      scope: "contract",
    });

    const updated = await prisma.contractLedger.update({
      where: {
        id: contract.id,
      },
      data: {
        status: nextStatus,
        signedAt: nextStatus === "SIGNED" ? new Date() : contract.signedAt,
        activatedAt: nextStatus === "ACTIVATED" ? new Date() : contract.activatedAt,
        metadata: mergeMetadata(contract.metadata, {
          ...(metadata || {}),
          lastTransitionAt: new Date().toISOString(),
          lastTransition: `${contract.status}->${nextStatus}`,
        }) as Prisma.InputJsonValue,
        version: {
          increment: contract.status === nextStatus ? 0 : 1,
        },
      },
    });

    await publishCommerceEvent({
      event: "commerce.contract.status_changed",
      businessId,
      aggregateType: "contract_ledger",
      aggregateId: contract.id,
      eventKey: `${contract.contractKey}:${contract.status}:${nextStatus}`,
      payload: {
        businessId,
        contractId: contract.id,
        contractKey,
        from: contract.status,
        to: nextStatus,
      },
    });

    return updated;
  };

  const sendForSignature = async ({
    businessId,
    contractKey,
    sentBy = "HUMAN",
  }: {
    businessId: string;
    contractKey: string;
    sentBy?: string;
  }) =>
    transitionContractStatus({
      businessId,
      contractKey,
      nextStatus: "SENT_FOR_SIGNATURE",
      metadata: {
        sentBy: normalizeActor(sentBy),
      },
    });

  const activateContract = async ({
    businessId,
    contractKey,
    activatedBy = "SYSTEM",
  }: {
    businessId: string;
    contractKey: string;
    activatedBy?: string;
  }) =>
    transitionContractStatus({
      businessId,
      contractKey,
      nextStatus: "ACTIVATED",
      metadata: {
        activatedBy: normalizeActor(activatedBy),
      },
    });

  return {
    generateFromProposal,
    transitionContractStatus,
    sendForSignature,
    activateContract,
  };
};

export const contractEngineService = createContractEngineService();
