import { Prisma, ProposalStatus } from "@prisma/client";
import prisma from "../config/prisma";
import { publishCommerceEvent } from "./commerceEvent.service";
import { getIntelligenceRuntimeInfluence } from "./intelligence/intelligenceRuntimeInfluence.service";
import { taxComplianceService } from "./taxCompliance.service";
import {
  DISCOUNT_APPROVAL_TRANSITIONS,
  PROPOSAL_TRANSITIONS,
  applyTax,
  assertTransition,
  buildDeterministicDigest,
  buildLedgerKey,
  clampPercent,
  mergeMetadata,
  normalizeActor,
  normalizeBillingCycle,
  normalizeCurrency,
  toMinor,
} from "./commerce/shared";
import { toRecord } from "./reception.shared";

const pickPricingCatalog = (rows: any[], businessId: string) => {
  const businessSpecific = rows.find((row) => row.businessId === businessId);
  if (businessSpecific) {
    return businessSpecific;
  }

  return rows.find((row) => !row.businessId) || null;
};

const computeAutoApprovalThreshold = (policy: any | null) => {
  const workflow = toRecord(policy?.discountApprovalWorkflow);
  const threshold = Number(workflow.autoApprovePercent);

  if (Number.isFinite(threshold)) {
    return clampPercent(threshold);
  }

  return 10;
};

export const createProposalEngineService = () => {
  const resolveCommercePolicy = async (businessId: string) => {
    const policies = await prisma.commercePolicy.findMany({
      where: {
        businessId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 1,
    });

    return policies[0] || null;
  };

  const resolvePricingCatalog = async ({
    businessId,
    planCode,
    currency,
    billingCycle,
  }: {
    businessId: string;
    planCode: string;
    currency: string;
    billingCycle: string;
  }) => {
    const rows = await prisma.pricingCatalog.findMany({
      where: {
        planCode: String(planCode || "").trim().toUpperCase(),
        currency: normalizeCurrency(currency),
        billingCycle: normalizeBillingCycle(billingCycle),
        isActive: true,
        OR: [
          {
            businessId,
          },
          {
            businessId: null,
          },
        ],
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    });

    return pickPricingCatalog(rows, businessId);
  };

  const createProposal = async ({
    businessId,
    leadId = null,
    planCode,
    billingCycle = "monthly",
    currency = "INR",
    quantity = 1,
    discountPercent = 0,
    customUnitPriceMinor = null,
    lineItems = null,
    metadata = null,
    source = "SYSTEM",
    requestedBy = "SYSTEM",
    idempotencyKey = null,
  }: {
    businessId: string;
    leadId?: string | null;
    planCode: string;
    billingCycle?: string;
    currency?: string;
    quantity?: number;
    discountPercent?: number;
    customUnitPriceMinor?: number | null;
    lineItems?: Record<string, unknown>[] | null;
    metadata?: Record<string, unknown> | null;
    source?: string;
    requestedBy?: string;
    idempotencyKey?: string | null;
  }) => {
    const normalizedIdempotency = String(idempotencyKey || "").trim() || null;

    if (normalizedIdempotency) {
      const existing = await prisma.proposalLedger.findUnique({
        where: {
          idempotencyKey: normalizedIdempotency,
        },
      });

      if (existing) {
        return existing;
      }
    }

    const normalizedQuantity = Math.max(1, Math.floor(Number(quantity || 1)));
    const normalizedDiscount = clampPercent(discountPercent);
    const normalizedPlanCode = String(planCode || "").trim().toUpperCase() || "CUSTOM";
    const normalizedCurrency = normalizeCurrency(currency);
    const normalizedBillingCycle = normalizeBillingCycle(billingCycle);

    const [pricing, policy] = await Promise.all([
      resolvePricingCatalog({
        businessId,
        planCode: normalizedPlanCode,
        currency: normalizedCurrency,
        billingCycle: normalizedBillingCycle,
      }),
      resolveCommercePolicy(businessId),
    ]);
    const runtime = await getIntelligenceRuntimeInfluence({
      businessId,
      leadId,
    }).catch(() => null);

    const baseUnitPriceMinor =
      customUnitPriceMinor !== null && customUnitPriceMinor !== undefined
        ? toMinor(customUnitPriceMinor)
        : toMinor(pricing?.unitPriceMinor || 0);
    const intelligenceMultiplier =
      customUnitPriceMinor !== null && customUnitPriceMinor !== undefined
        ? 1
        : Number(runtime?.controls.commerce.priceMultiplier || 1);
    const unitPriceMinor = toMinor(
      Math.round(baseUnitPriceMinor * intelligenceMultiplier)
    );
    const subtotalMinor = toMinor(unitPriceMinor * normalizedQuantity);
    const discountRequestedMinor = Math.round((subtotalMinor * normalizedDiscount) / 100);
    const subtotalAfterDiscount = Math.max(0, subtotalMinor - discountRequestedMinor);
    const taxRules = toRecord(policy?.taxRules);
    const taxBps = Number(taxRules.taxBps);
    const { taxMinor, totalMinor } = applyTax({
      subtotalMinor: subtotalAfterDiscount,
      taxBps: Number.isFinite(taxBps) ? Math.max(0, taxBps) : undefined,
    });
    const autoApproveThreshold = Math.min(
      computeAutoApprovalThreshold(policy),
      Number(runtime?.controls.commerce.discountAutoApproveMaxPercent || 100)
    );
    const requiresApproval = normalizedDiscount > autoApproveThreshold;
    const status: ProposalStatus = requiresApproval ? "PENDING_APPROVAL" : "APPROVED";

    return prisma.$transaction(async (tx) => {
      const proposal = await tx.proposalLedger.create({
        data: {
          businessId,
          leadId,
          proposalKey: buildLedgerKey("proposal"),
          source: normalizeActor(source),
          status,
          currency: normalizedCurrency,
          subtotalMinor,
          taxMinor,
          totalMinor,
          quantity: normalizedQuantity,
          unitPriceMinor,
          discountRequestedMinor,
          discountApprovedMinor: requiresApproval ? 0 : discountRequestedMinor,
          discountPercent: normalizedDiscount,
          lineItems: (lineItems || []) as Prisma.InputJsonValue,
          pricingSnapshot: {
            planCode: normalizedPlanCode,
            billingCycle: normalizedBillingCycle,
            catalogKey: pricing?.catalogKey || null,
            pricingModel: pricing?.pricingModel || null,
            rawPricing: pricing || null,
          } as Prisma.InputJsonValue,
          policySnapshot: policy
            ? ({
                policyKey: policy.policyKey,
                version: policy.version,
                autoApproveThreshold,
              } as Prisma.InputJsonValue)
            : undefined,
          metadata: mergeMetadata(
            {
              requestedBy: normalizeActor(requestedBy),
              billingCycle: normalizedBillingCycle,
              planCode: normalizedPlanCode,
              digest: buildDeterministicDigest({
                businessId,
                leadId,
                normalizedPlanCode,
                normalizedBillingCycle,
                normalizedCurrency,
                normalizedQuantity,
                normalizedDiscount,
              }).slice(0, 24),
              intelligencePriceMultiplier:
                customUnitPriceMinor !== null && customUnitPriceMinor !== undefined
                  ? 1
                  : intelligenceMultiplier,
              intelligenceDiscountThreshold: autoApproveThreshold,
              intelligencePolicyVersion: runtime?.policyVersion || null,
            },
            metadata || undefined
          ) as Prisma.InputJsonValue,
          idempotencyKey: normalizedIdempotency,
        },
      });

      await publishCommerceEvent({
        tx,
        event: "commerce.proposal.created",
        businessId,
        aggregateType: "proposal_ledger",
        aggregateId: proposal.id,
        eventKey: proposal.proposalKey,
        payload: {
          businessId,
          leadId,
          proposalId: proposal.id,
          proposalKey: proposal.proposalKey,
          status,
          totalMinor,
          currency: normalizedCurrency,
          planCode: normalizedPlanCode,
          billingCycle: normalizedBillingCycle,
          quantity: normalizedQuantity,
          discountPercent: normalizedDiscount,
          requiresApproval,
        },
      });

      if (requiresApproval) {
        const approval = await tx.discountApprovalLedger.create({
          data: {
            businessId,
            proposalId: proposal.id,
            approvalKey: buildLedgerKey("discount_approval"),
            status: "REQUESTED",
            requestedBy: normalizeActor(requestedBy),
            requestedPercent: normalizedDiscount,
            requestedMinor: discountRequestedMinor,
            reason: "discount_threshold_exceeded",
            idempotencyKey: buildDeterministicDigest({
              businessId,
              proposalKey: proposal.proposalKey,
              normalizedDiscount,
            }),
            metadata: {
              autoApproveThreshold,
              policyKey: policy?.policyKey || null,
            } as Prisma.InputJsonValue,
          },
        });

        await publishCommerceEvent({
          tx,
          event: "commerce.discount.requested",
          businessId,
          aggregateType: "discount_approval_ledger",
          aggregateId: approval.id,
          eventKey: approval.approvalKey,
          payload: {
            businessId,
            proposalId: proposal.id,
            proposalKey: proposal.proposalKey,
            approvalId: approval.id,
            approvalKey: approval.approvalKey,
            requestedPercent: normalizedDiscount,
            requestedMinor: discountRequestedMinor,
            thresholdPercent: autoApproveThreshold,
          },
        });
      }

      await taxComplianceService.recordTaxEvent({
        tx,
        businessId,
        eventType: "PROPOSAL",
        jurisdiction: String(toRecord(policy?.taxRules).jurisdiction || "GLOBAL"),
        taxType: String(toRecord(policy?.taxRules).taxType || (normalizedCurrency === "INR" ? "GST" : "VAT")),
        reverseCharge: Boolean(toRecord(policy?.taxRules).reverseCharge),
        exemptionCode:
          String(toRecord(policy?.taxRules).exemptionCode || "").trim() || null,
        withholdingMinor: Number(toRecord(policy?.taxRules).withholdingMinor || 0),
        taxableMinor: subtotalAfterDiscount,
        taxMinor,
        totalMinor,
        currency: normalizedCurrency,
        proposalKey: proposal.proposalKey,
        mappingRef: `proposal:${proposal.proposalKey}`,
        metadata: {
          policyKey: policy?.policyKey || null,
          policyVersion: policy?.version || null,
          planCode: normalizedPlanCode,
          billingCycle: normalizedBillingCycle,
        },
        idempotencyKey: `tax:proposal:${proposal.id}`,
      });

      return proposal;
    });
  };

  const transitionProposalStatus = async ({
    businessId,
    proposalKey,
    nextStatus,
    metadata,
  }: {
    businessId: string;
    proposalKey: string;
    nextStatus: ProposalStatus;
    metadata?: Record<string, unknown> | null;
  }) => {
    const proposal = await prisma.proposalLedger.findFirst({
      where: {
        businessId,
        proposalKey,
      },
    });

    if (!proposal) {
      throw new Error("proposal_not_found");
    }

    assertTransition({
      current: proposal.status,
      next: nextStatus,
      transitions: PROPOSAL_TRANSITIONS,
      scope: "proposal",
    });

    const updated = await prisma.proposalLedger.update({
      where: {
        id: proposal.id,
      },
      data: {
        status: nextStatus,
        acceptedAt: nextStatus === "ACCEPTED" ? new Date() : proposal.acceptedAt,
        metadata: mergeMetadata(proposal.metadata, {
          ...(metadata || {}),
          lastTransitionAt: new Date().toISOString(),
          lastTransition: `${proposal.status}->${nextStatus}`,
        }) as Prisma.InputJsonValue,
        version: {
          increment: proposal.status === nextStatus ? 0 : 1,
        },
      },
    });

    await publishCommerceEvent({
      event: "commerce.proposal.status_changed",
      businessId,
      aggregateType: "proposal_ledger",
      aggregateId: proposal.id,
      eventKey: `${proposal.proposalKey}:${proposal.status}:${nextStatus}`,
      payload: {
        businessId,
        proposalId: proposal.id,
        proposalKey,
        from: proposal.status,
        to: nextStatus,
      },
    });

    return updated;
  };

  const decideDiscountApproval = async ({
    businessId,
    approvalKey,
    approved,
    decidedBy = "HUMAN",
    approvedPercent,
    reason = null,
    metadata = null,
  }: {
    businessId: string;
    approvalKey: string;
    approved: boolean;
    decidedBy?: string;
    approvedPercent?: number | null;
    reason?: string | null;
    metadata?: Record<string, unknown> | null;
  }) => {
    const approval = await prisma.discountApprovalLedger.findFirst({
      where: {
        businessId,
        approvalKey,
      },
    });

    if (!approval) {
      throw new Error("discount_approval_not_found");
    }

    const nextStatus = approved ? "APPROVED" : "REJECTED";

    assertTransition({
      current: approval.status,
      next: nextStatus,
      transitions: DISCOUNT_APPROVAL_TRANSITIONS,
      scope: "discount_approval",
    });

    const decidedPercent = approved
      ? clampPercent(approvedPercent === undefined || approvedPercent === null
          ? approval.requestedPercent
          : approvedPercent)
      : 0;

    return prisma.$transaction(async (tx) => {
      const updatedApproval = await tx.discountApprovalLedger.update({
        where: {
          id: approval.id,
        },
        data: {
          status: nextStatus,
          approvedPercent: decidedPercent,
          approvedMinor: Math.round((approval.requestedMinor * decidedPercent) / Math.max(1, approval.requestedPercent || 1)),
          approvedBy: String(decidedBy || "HUMAN").trim() || "HUMAN",
          reason: reason || approval.reason || null,
          decidedAt: new Date(),
          metadata: mergeMetadata(approval.metadata, metadata || undefined) as Prisma.InputJsonValue,
        },
      });

      if (approval.proposalId) {
        const proposal = await tx.proposalLedger.findUnique({
          where: {
            id: approval.proposalId,
          },
        });

        if (proposal) {
          const subtotalAfterDiscount = Math.max(
            0,
            Number(proposal.subtotalMinor || 0) - updatedApproval.approvedMinor
          );
          const { taxMinor, totalMinor } = applyTax({
            subtotalMinor: subtotalAfterDiscount,
            taxBps: Number(toRecord(proposal.policySnapshot).taxBps || undefined),
          });

          await tx.proposalLedger.update({
            where: {
              id: proposal.id,
            },
            data: {
              status: approved ? "APPROVED" : "REJECTED",
              discountApprovedMinor: approved ? updatedApproval.approvedMinor : 0,
              discountPercent: approved ? decidedPercent : 0,
              taxMinor,
              totalMinor,
              metadata: mergeMetadata(proposal.metadata, {
                discountApprovalKey: approval.approvalKey,
                discountApprovalStatus: updatedApproval.status,
              }) as Prisma.InputJsonValue,
            },
          });

          await taxComplianceService.recordTaxEvent({
            tx,
            businessId,
            eventType: "PROPOSAL",
            jurisdiction: String(toRecord(proposal.policySnapshot).jurisdiction || "GLOBAL"),
            taxType: String(
              toRecord(proposal.policySnapshot).taxType ||
                (proposal.currency === "INR" ? "GST" : "VAT")
            ),
            reverseCharge: Boolean(toRecord(proposal.policySnapshot).reverseCharge),
            exemptionCode:
              String(toRecord(proposal.policySnapshot).exemptionCode || "").trim() || null,
            withholdingMinor: Number(toRecord(proposal.policySnapshot).withholdingMinor || 0),
            taxableMinor: subtotalAfterDiscount,
            taxMinor,
            totalMinor,
            currency: proposal.currency,
            proposalKey: proposal.proposalKey,
            mappingRef: `proposal:${proposal.proposalKey}:discount`,
            metadata: {
              discountApprovalKey: approval.approvalKey,
              discountApprovalStatus: updatedApproval.status,
            },
            idempotencyKey: `tax:proposal:${proposal.id}:${updatedApproval.id}`,
          });
        }
      }

      await publishCommerceEvent({
        tx,
        event: "commerce.discount.decided",
        businessId,
        aggregateType: "discount_approval_ledger",
        aggregateId: updatedApproval.id,
        eventKey: `${approvalKey}:${updatedApproval.status}`,
        payload: {
          businessId,
          approvalId: updatedApproval.id,
          approvalKey,
          proposalId: updatedApproval.proposalId,
          status: updatedApproval.status,
          approvedPercent: updatedApproval.approvedPercent,
          approvedMinor: updatedApproval.approvedMinor,
        },
      });

      return updatedApproval;
    });
  };

  const sendProposal = async ({
    businessId,
    proposalKey,
  }: {
    businessId: string;
    proposalKey: string;
  }) =>
    transitionProposalStatus({
      businessId,
      proposalKey,
      nextStatus: "SENT",
    });

  const acceptProposal = async ({
    businessId,
    proposalKey,
    acceptedBy = "SELF",
    metadata = null,
  }: {
    businessId: string;
    proposalKey: string;
    acceptedBy?: string;
    metadata?: Record<string, unknown> | null;
  }) =>
    transitionProposalStatus({
      businessId,
      proposalKey,
      nextStatus: "ACCEPTED",
      metadata: {
        acceptedBy: normalizeActor(acceptedBy),
        ...(metadata || {}),
      },
    });

  const expireProposal = async ({
    businessId,
    proposalKey,
  }: {
    businessId: string;
    proposalKey: string;
  }) =>
    transitionProposalStatus({
      businessId,
      proposalKey,
      nextStatus: "EXPIRED",
    });

  return {
    resolveCommercePolicy,
    resolvePricingCatalog,
    createProposal,
    transitionProposalStatus,
    decideDiscountApproval,
    sendProposal,
    acceptProposal,
    expireProposal,
  };
};

export const proposalEngineService = createProposalEngineService();
