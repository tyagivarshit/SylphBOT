import type { Prisma } from "@prisma/client";
import prisma from "../config/prisma";

export type AddonType = "ai_credits" | "contacts";

export type AddonBalanceSnapshot = {
  aiCredits: number;
  contacts: number;
};

const ADDON_TYPES: AddonType[] = ["ai_credits", "contacts"];

const normalizeBusinessId = (businessId: string) =>
  String(businessId || "").trim();

const normalizeCredits = (credits: number) => {
  const normalized = Math.floor(Number(credits));

  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error("Invalid add-on credits");
  }

  return normalized;
};

const getAddonBalanceValue = (
  records: Array<{ type: string; balance: number }>,
  type: AddonType
) =>
  records.find((record) => record.type === type)?.balance || 0;

const upsertAddonBalance = async (
  tx: Prisma.TransactionClient,
  businessId: string,
  type: AddonType
) =>
  tx.addonBalance.upsert({
    where: {
      businessId_type: {
        businessId,
        type,
      },
    },
    update: {},
    create: {
      businessId,
      type,
      balance: 0,
    },
  });

export const getAddonBalance = async (
  businessId: string
): Promise<AddonBalanceSnapshot> => {
  const normalizedBusinessId = normalizeBusinessId(businessId);

  if (!normalizedBusinessId) {
    throw new Error("Invalid business id");
  }

  const balances = await prisma.addonBalance.findMany({
    where: {
      businessId: normalizedBusinessId,
      type: {
        in: ADDON_TYPES,
      },
    },
    select: {
      type: true,
      balance: true,
    },
  });

  return {
    aiCredits: getAddonBalanceValue(balances, "ai_credits"),
    contacts: getAddonBalanceValue(balances, "contacts"),
  };
};

export const getAddonCredits = async (
  businessId: string,
  type: AddonType
) => {
  const normalizedBusinessId = normalizeBusinessId(businessId);

  if (!normalizedBusinessId) {
    throw new Error("Invalid business id");
  }

  const balance = await prisma.addonBalance.findUnique({
    where: {
      businessId_type: {
        businessId: normalizedBusinessId,
        type,
      },
    },
    select: {
      balance: true,
    },
  });

  return balance?.balance || 0;
};

export const purchaseAddon = async (
  businessId: string,
  type: AddonType,
  credits: number
) => {
  const normalizedBusinessId = normalizeBusinessId(businessId);
  const normalizedCredits = normalizeCredits(credits);

  if (!normalizedBusinessId) {
    throw new Error("Invalid business id");
  }

  if (!ADDON_TYPES.includes(type)) {
    throw new Error("Invalid add-on type");
  }

  const updated = await prisma.$transaction(async (tx) => {
    await upsertAddonBalance(tx, normalizedBusinessId, type);

    return tx.addonBalance.update({
      where: {
        businessId_type: {
          businessId: normalizedBusinessId,
          type,
        },
      },
      data: {
        balance: {
          increment: normalizedCredits,
        },
      },
    });
  });

  return {
    businessId: normalizedBusinessId,
    type,
    purchasedCredits: normalizedCredits,
    balance: updated.balance,
  };
};

export const consumeAddonCreditsTx = async (
  tx: Prisma.TransactionClient,
  businessId: string,
  type: AddonType,
  credits: number
) => {
  const normalizedBusinessId = normalizeBusinessId(businessId);
  const normalizedCredits = normalizeCredits(credits);

  const current = await upsertAddonBalance(
    tx,
    normalizedBusinessId,
    type
  );

  if (current.balance < normalizedCredits) {
    throw new Error("Insufficient add-on credits");
  }

  return tx.addonBalance.update({
    where: {
      businessId_type: {
        businessId: normalizedBusinessId,
        type,
      },
    },
    data: {
      balance: {
        decrement: normalizedCredits,
      },
    },
  });
};
