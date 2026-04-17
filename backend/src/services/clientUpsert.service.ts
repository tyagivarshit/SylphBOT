import prisma from "../config/prisma";

const normalizeNullableString = (value?: unknown) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

const createClientUpsertError = (message: string, code: string) => {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
};

export const getClientUniqueWhere = ({
  phoneNumberId,
  pageId,
}: {
  phoneNumberId?: unknown;
  pageId?: unknown;
}) => {
  const normalizedPhoneNumberId = normalizeNullableString(phoneNumberId);
  const normalizedPageId = normalizeNullableString(pageId);

  if (normalizedPhoneNumberId) {
    return {
      where: { phoneNumberId: normalizedPhoneNumberId },
      phoneNumberId: normalizedPhoneNumberId,
      pageId: normalizedPageId,
    };
  }

  if (normalizedPageId) {
    return {
      where: { pageId: normalizedPageId },
      phoneNumberId: normalizedPhoneNumberId,
      pageId: normalizedPageId,
    };
  }

  return null;
};

export const upsertClientByUniqueKey = async ({
  businessId,
  platform,
  phoneNumberId,
  pageId,
  accessToken,
  aiTone,
  businessInfo,
  pricingInfo,
  faqKnowledge,
  salesInstructions,
}: {
  businessId: string;
  platform: string;
  phoneNumberId?: unknown;
  pageId?: unknown;
  accessToken: string;
  aiTone?: unknown;
  businessInfo?: unknown;
  pricingInfo?: unknown;
  faqKnowledge?: unknown;
  salesInstructions?: unknown;
}) => {
  const uniqueKey = getClientUniqueWhere({
    phoneNumberId,
    pageId,
  });

  if (!uniqueKey) {
    throw createClientUpsertError(
      "phoneNumberId or pageId is required",
      "CLIENT_UNIQUE_KEY_REQUIRED"
    );
  }

  console.log("CLIENT UPSERT", {
    phoneNumberId: uniqueKey.phoneNumberId,
    pageId: uniqueKey.pageId,
  });

  const existing = await prisma.client.findUnique({
    where: uniqueKey.where,
  });

  if (existing && existing.businessId !== businessId) {
    throw createClientUpsertError(
      "This connected account already exists for another business",
      "CLIENT_OWNERSHIP_CONFLICT"
    );
  }

  if (uniqueKey.phoneNumberId) {
    const existingPhoneClient = await prisma.client.findUnique({
      where: {
        phoneNumberId: uniqueKey.phoneNumberId,
      },
    });

    if (
      existingPhoneClient &&
      existingPhoneClient.id !== existing?.id &&
      existingPhoneClient.businessId !== businessId
    ) {
      throw createClientUpsertError(
        "This connected account already exists for another business",
        "CLIENT_OWNERSHIP_CONFLICT"
      );
    }

    if (
      existingPhoneClient &&
      existingPhoneClient.id !== existing?.id &&
      existingPhoneClient.businessId === businessId
    ) {
      throw createClientUpsertError(
        "This connected account already exists for your business",
        "CLIENT_DUPLICATE_KEY_CONFLICT"
      );
    }
  }

  if (uniqueKey.pageId) {
    const existingPageClient = await prisma.client.findUnique({
      where: {
        pageId: uniqueKey.pageId,
      },
    });

    if (
      existingPageClient &&
      existingPageClient.id !== existing?.id &&
      existingPageClient.businessId !== businessId
    ) {
      throw createClientUpsertError(
        "This connected account already exists for another business",
        "CLIENT_OWNERSHIP_CONFLICT"
      );
    }

    if (
      existingPageClient &&
      existingPageClient.id !== existing?.id &&
      existingPageClient.businessId === businessId
    ) {
      throw createClientUpsertError(
        "This connected account already exists for your business",
        "CLIENT_DUPLICATE_KEY_CONFLICT"
      );
    }
  }

  const normalizedPlatform =
    normalizeNullableString(platform)?.toUpperCase() || "SYSTEM";
  const normalizedAccessToken = String(accessToken || "").trim();

  return prisma.client.upsert({
    where: uniqueKey.where,
    update: {
      businessId,
      platform: normalizedPlatform,
      phoneNumberId: uniqueKey.phoneNumberId || existing?.phoneNumberId || null,
      pageId: uniqueKey.pageId || existing?.pageId || null,
      accessToken: normalizedAccessToken,
      aiTone: normalizeNullableString(aiTone),
      businessInfo: normalizeNullableString(businessInfo),
      pricingInfo: normalizeNullableString(pricingInfo),
      faqKnowledge: normalizeNullableString(faqKnowledge),
      salesInstructions: normalizeNullableString(salesInstructions),
      isActive: true,
      deletedAt: null,
    },
    create: {
      businessId,
      platform: normalizedPlatform,
      phoneNumberId: uniqueKey.phoneNumberId || null,
      pageId: uniqueKey.pageId || null,
      accessToken: normalizedAccessToken,
      aiTone: normalizeNullableString(aiTone),
      businessInfo: normalizeNullableString(businessInfo),
      pricingInfo: normalizeNullableString(pricingInfo),
      faqKnowledge: normalizeNullableString(faqKnowledge),
      salesInstructions: normalizeNullableString(salesInstructions),
      isActive: true,
    },
  });
};

export const upsertSystemClient = async (businessId: string) => {
  const normalizedBusinessId = normalizeNullableString(businessId);

  if (!normalizedBusinessId) {
    throw createClientUpsertError("businessId is required", "BUSINESS_REQUIRED");
  }

  console.log("CLIENT UPSERT", {
    phoneNumberId: null,
    pageId: null,
  });

  return prisma.client.upsert({
    where: {
      businessId_platform: {
        businessId: normalizedBusinessId,
        platform: "SYSTEM",
      },
    },
    update: {
      accessToken: "AUTO_GENERATED",
      isActive: true,
      deletedAt: null,
    },
    create: {
      businessId: normalizedBusinessId,
      platform: "SYSTEM",
      accessToken: "AUTO_GENERATED",
      isActive: true,
    },
  });
};
