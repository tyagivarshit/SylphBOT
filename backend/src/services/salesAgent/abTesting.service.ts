import prisma from "../../config/prisma";
import logger from "../../utils/logger";
import type { LeadRevenueState, SalesMessageVariantContext } from "./types";

type VariantSelectionInput = {
  businessId: string;
  clientId?: string | null;
  messageType?: string;
  leadState?: LeadRevenueState | string | null;
};

type VariantOutcomeInput = {
  variantId: string;
  outcome: string;
  value?: number | null;
};

const DEFAULT_VARIANTS = [
  {
    variantKey: "curiosity_short",
    label: "Curiosity Short",
    tone: "curious-human",
    ctaStyle: "soft-question",
    messageLength: "short",
    weight: 3,
    instructions:
      "Lead with a curiosity hook, keep it under two short sentences, and end with one easy question.",
  },
  {
    variantKey: "value_proof",
    label: "Value Proof",
    tone: "confident-proof",
    ctaStyle: "proof-backed",
    messageLength: "medium",
    weight: 2,
    instructions:
      "State the clearest value, add one proof cue if available, and ask for the next low-friction step.",
  },
  {
    variantKey: "direct_cta",
    label: "Direct CTA",
    tone: "decisive-closer",
    ctaStyle: "direct-booking",
    messageLength: "short",
    weight: 2,
    instructions:
      "Use concise urgency only when justified, avoid pressure, and move directly toward booking or payment.",
  },
] as const;

const VARIANT_STRUCTURE_MAP: Record<string, string> = {
  curiosity_short: "curiosity_hook_question",
  value_proof: "value_proof_cta",
  direct_cta: "direct_close",
};

const outcomeValue = (outcome: string, value?: number | null) => {
  const normalized = outcome.toLowerCase();

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (normalized === "payment_completed") return 8;
  if (normalized === "booked_call") return 5;
  if (normalized === "link_clicked") return 2;
  if (normalized === "replied") return 1;
  return 0.25;
};

const toVariantContext = (variant: {
  id: string;
  variantKey: string;
  label: string;
  tone: string;
  ctaStyle: string;
  messageLength: string;
  instructions: string;
  weight: number;
  isPromoted: boolean;
}): SalesMessageVariantContext => ({
  id: variant.id,
  variantKey: variant.variantKey,
  label: variant.label,
  tone: variant.tone,
  ctaStyle: variant.ctaStyle,
  messageLength: variant.messageLength,
  structure:
    VARIANT_STRUCTURE_MAP[variant.variantKey] ||
    `${variant.ctaStyle}-${variant.messageLength}`,
  instructions: variant.instructions,
  weight: variant.weight,
  isPromoted: variant.isPromoted,
});

const ensureDefaultVariants = async ({
  businessId,
  clientId,
  messageType,
}: Required<Pick<VariantSelectionInput, "businessId" | "messageType">> & {
  clientId?: string | null;
}) => {
  for (const variant of DEFAULT_VARIANTS) {
    try {
      const existing = await prisma.salesMessageVariant.findFirst({
        where: {
          businessId,
          clientId: clientId || null,
          messageType,
          variantKey: variant.variantKey,
        },
      });

      if (existing) {
        continue;
      }

      await prisma.salesMessageVariant.create({
        data: {
          businessId,
          clientId: clientId || null,
          messageType,
          ...variant,
        },
      });
    } catch (error) {
      logger.debug(
        {
          businessId,
          clientId: clientId || null,
          messageType,
          variantKey: variant.variantKey,
          error,
        },
        "Default A/B variant already exists or could not be created"
      );
    }
  }
};

const rankVariants = <
  T extends {
    impressions: number;
    conversions: number;
    conversionValue: number;
    weight: number;
    isPromoted: boolean;
  },
>(
  variants: T[]
) =>
  [...variants].sort((left, right) => {
    const leftConversionRate =
      left.impressions > 0 ? left.conversions / left.impressions : 0;
    const rightConversionRate =
      right.impressions > 0 ? right.conversions / right.impressions : 0;
    const leftValueRate =
      left.impressions > 0 ? left.conversionValue / left.impressions : 0;
    const rightValueRate =
      right.impressions > 0 ? right.conversionValue / right.impressions : 0;

    if (Number(right.isPromoted) !== Number(left.isPromoted)) {
      return Number(right.isPromoted) - Number(left.isPromoted);
    }

    if (rightValueRate !== leftValueRate) {
      return rightValueRate - leftValueRate;
    }

    if (rightConversionRate !== leftConversionRate) {
      return rightConversionRate - leftConversionRate;
    }

    if (right.conversions !== left.conversions) {
      return right.conversions - left.conversions;
    }

    if (right.weight !== left.weight) {
      return right.weight - left.weight;
    }

    return right.impressions - left.impressions;
  });

export const getMessageVariantPool = async ({
  businessId,
  clientId,
  messageType = "AI_REPLY",
}: VariantSelectionInput): Promise<SalesMessageVariantContext[]> => {
  if (!businessId) {
    return [];
  }

  await ensureDefaultVariants({
    businessId,
    clientId: clientId || null,
    messageType,
  });

  const variants = await prisma.salesMessageVariant.findMany({
    where: {
      businessId,
      clientId: clientId || null,
      messageType,
      isActive: true,
    },
  });

  return rankVariants(variants).map(toVariantContext);
};

export const selectMessageVariant = async ({
  businessId,
  clientId,
  messageType = "AI_REPLY",
}: VariantSelectionInput): Promise<SalesMessageVariantContext | null> => {
  const variants = await getMessageVariantPool({
    businessId,
    clientId,
    messageType,
  });

  if (!variants.length) {
    return null;
  }

  return variants[0];
};

export const recordVariantImpression = async (variantId?: string | null) => {
  if (!variantId) {
    return;
  }

  try {
    await prisma.salesMessageVariant.update({
      where: {
        id: variantId,
      },
      data: {
        impressions: {
          increment: 1,
        },
      },
    });
  } catch (error) {
    logger.debug({ variantId, error }, "A/B impression tracking skipped");
  }
};

export const recordVariantOutcome = async ({
  variantId,
  outcome,
  value,
}: VariantOutcomeInput) => {
  if (!variantId) {
    return;
  }

  try {
    const updated = await prisma.salesMessageVariant.update({
      where: {
        id: variantId,
      },
      data: {
        conversions: {
          increment: 1,
        },
        conversionValue: {
          increment: outcomeValue(outcome, value),
        },
      },
    });

    if (updated.impressions >= 10 && updated.conversions % 3 === 0) {
      await autoPromoteBestVariant({
        businessId: updated.businessId,
        clientId: updated.clientId,
        messageType: updated.messageType,
      });
    }
  } catch (error) {
    logger.debug({ variantId, outcome, error }, "A/B outcome tracking skipped");
  }
};

export const autoPromoteBestVariant = async ({
  businessId,
  clientId,
  messageType = "AI_REPLY",
}: Required<Pick<VariantSelectionInput, "businessId">> & {
  clientId?: string | null;
  messageType?: string;
}) => {
  const variants = await prisma.salesMessageVariant.findMany({
    where: {
      businessId,
      clientId: clientId || null,
      messageType,
      isActive: true,
    },
  });

  const eligible = variants
    .filter((variant) => variant.impressions >= 10)
    .map((variant) => ({
      ...variant,
      rate:
        variant.impressions > 0
          ? variant.conversions / variant.impressions
          : 0,
      valueRate:
        variant.impressions > 0
          ? variant.conversionValue / variant.impressions
          : 0,
    }))
    .sort((left, right) => {
      if (right.valueRate !== left.valueRate) {
        return right.valueRate - left.valueRate;
      }

      if (right.rate !== left.rate) {
        return right.rate - left.rate;
      }

      return right.impressions - left.impressions;
    });

  if (!eligible.length) {
    return null;
  }

  const winner = eligible[0];

  await Promise.all(
    variants.map((variant) =>
      prisma.salesMessageVariant.update({
        where: {
          id: variant.id,
        },
        data: {
          isPromoted: variant.id === winner.id,
          weight:
            variant.id === winner.id
              ? Math.min(10, Math.max(variant.weight, 4) + 1)
              : Math.max(1, Math.min(variant.weight, 3)),
        },
      })
    )
  );

  logger.info(
    {
      businessId,
      clientId: clientId || null,
      messageType,
      variantId: winner.id,
      variantKey: winner.variantKey,
      rate: winner.rate,
      valueRate: winner.valueRate,
    },
    "A/B variant auto-promoted"
  );

  return toVariantContext(winner);
};

export const getVariantPerformance = async ({
  businessId,
  clientId,
  messageType,
}: {
  businessId: string;
  clientId?: string | null;
  messageType?: string;
}) => {
  const variants = await prisma.salesMessageVariant.findMany({
    where: {
      businessId,
      ...(clientId !== undefined ? { clientId: clientId || null } : {}),
      ...(messageType ? { messageType } : {}),
      isActive: true,
    },
    orderBy: {
      conversionValue: "desc",
    },
  });

  return variants.map((variant) => ({
    id: variant.id,
    variantKey: variant.variantKey,
    label: variant.label,
    tone: variant.tone,
    ctaStyle: variant.ctaStyle,
    messageLength: variant.messageLength,
    impressions: variant.impressions,
    conversions: variant.conversions,
    conversionRate:
      variant.impressions > 0
        ? Math.round((variant.conversions / variant.impressions) * 1000) / 10
        : 0,
    conversionValue: variant.conversionValue,
    isPromoted: variant.isPromoted,
    weight: variant.weight,
  }));
};
