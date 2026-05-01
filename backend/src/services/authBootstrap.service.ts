import prisma from "../config/prisma";
import { buildLedgerKey } from "./commerce/shared";
import { resolveUserWorkspaceIdentity } from "./tenant.service";
import { getCurrentMonthYear } from "../utils/monthlyUsage.helper";

type ProfileSeed = {
  name?: string | null;
  email?: string | null;
  avatar?: string | null;
};

type EnsureAuthBootstrapContextInput = {
  userId: string;
  preferredBusinessId?: string | null;
  profileSeed?: ProfileSeed | null;
};

const normalizeText = (value?: string | null) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

const normalizeEmail = (value?: string | null) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
};

const shouldBackfillField = (current?: string | null, incoming?: string | null) => {
  if (!incoming) {
    return false;
  }

  return normalizeText(current) !== normalizeText(incoming);
};

const ensureWorkspaceBootstrapRows = async (businessId: string) => {
  const normalizedBusinessId = String(businessId || "").trim();

  if (!normalizedBusinessId) {
    return {
      usageSeeded: false,
      addonSeeded: false,
      billingSeeded: false,
    };
  }

  const { month, year } = getCurrentMonthYear();
  let usageSeeded = false;
  let addonSeeded = false;
  let billingSeeded = false;

  await prisma.$transaction(async (tx) => {
    const existingUsage = await tx.usage.findUnique({
      where: {
        businessId_month_year: {
          businessId: normalizedBusinessId,
          month,
          year,
        },
      },
      select: {
        id: true,
      },
    });

    if (!existingUsage) {
      await tx.usage.create({
        data: {
          businessId: normalizedBusinessId,
          month,
          year,
          aiCallsUsed: 0,
          messagesUsed: 0,
          followupsUsed: 0,
        },
      });
      usageSeeded = true;
    }

    const addonTypes = ["ai_credits", "contacts"];
    for (const type of addonTypes) {
      const existingAddon = await tx.addonBalance.findUnique({
        where: {
          businessId_type: {
            businessId: normalizedBusinessId,
            type,
          },
        },
        select: {
          id: true,
        },
      });

      if (!existingAddon) {
        await tx.addonBalance.create({
          data: {
            businessId: normalizedBusinessId,
            type,
            balance: 0,
          },
        });
        addonSeeded = true;
      }
    }

    const existingSubscription = await tx.subscriptionLedger.findFirst({
      where: {
        businessId: normalizedBusinessId,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
      },
    });

    if (!existingSubscription) {
      await tx.subscriptionLedger.create({
        data: {
          businessId: normalizedBusinessId,
          subscriptionKey: buildLedgerKey("subscription"),
          status: "PENDING",
          provider: "INTERNAL",
          planCode: "FREE_LOCKED",
          billingCycle: "monthly",
          currency: "INR",
          quantity: 1,
          unitPriceMinor: 0,
          amountMinor: 0,
          metadata: {
            source: "auth_bootstrap",
            seededAt: new Date().toISOString(),
          },
          idempotencyKey: `auth_bootstrap:${normalizedBusinessId}`,
        },
      });
      billingSeeded = true;
    }
  });

  return {
    usageSeeded,
    addonSeeded,
    billingSeeded,
  };
};

export const ensureAuthBootstrapContext = async (
  input: EnsureAuthBootstrapContextInput
) => {
  const userId = String(input.userId || "").trim();

  if (!userId) {
    throw new Error("user_id_required");
  }

  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      role: true,
      tokenVersion: true,
      businessId: true,
      isActive: true,
      deletedAt: true,
    },
  });

  if (!user || !user.isActive || user.deletedAt) {
    throw new Error("user_not_active");
  }

  const nextName = normalizeText(input.profileSeed?.name);
  const nextEmail = normalizeEmail(input.profileSeed?.email);
  const nextAvatar = normalizeText(input.profileSeed?.avatar);

  const profileUpdateData: Record<string, string> = {};
  const backfilledFields: string[] = [];

  if (shouldBackfillField(user.name, nextName)) {
    profileUpdateData.name = String(nextName);
    backfilledFields.push("name");
  }

  if (shouldBackfillField(user.email, nextEmail)) {
    profileUpdateData.email = String(nextEmail);
    backfilledFields.push("email");
  }

  if (shouldBackfillField(user.avatar, nextAvatar)) {
    profileUpdateData.avatar = String(nextAvatar);
    backfilledFields.push("avatar");
  }

  if (backfilledFields.length > 0) {
    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: profileUpdateData,
    });

    console.info("AUTH_PROFILE_BACKFILLED", {
      userId: user.id,
      fields: backfilledFields,
    });
  }

  const identity = await resolveUserWorkspaceIdentity({
    userId: user.id,
    preferredBusinessId: input.preferredBusinessId || user.businessId || null,
    persistResolvedBusinessId: true,
    bootstrapWorkspaceIfMissing: true,
  });

  if (!identity.businessId || !identity.workspace) {
    throw new Error("workspace_bootstrap_failed");
  }

  const bootstrapRows = await ensureWorkspaceBootstrapRows(identity.businessId);

  console.info("AUTH_WORKSPACE_READY", {
    userId: user.id,
    businessId: identity.businessId,
    source: identity.source,
    usageSeeded: bootstrapRows.usageSeeded,
    addonSeeded: bootstrapRows.addonSeeded,
    billingSeeded: bootstrapRows.billingSeeded,
  });

  return {
    user: {
      id: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
      email: nextEmail || user.email,
      name: nextName || user.name,
      avatar: nextAvatar || user.avatar,
      businessId: identity.businessId,
    },
    identity,
    backfilledFields,
  };
};
