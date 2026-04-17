import prisma from "../config/prisma";

export const getOrCreateClient = async (
  businessId: string,
  phoneNumberId: string
) => {

  const client = await prisma.client.upsert({
    where: { phoneNumberId }, // 🔥 FIX
    update: {
      isActive: true
    },
    create: {
      businessId,
      phoneNumberId, // 🔥 MUST
      platform: "SYSTEM",
      accessToken: "AUTO_GENERATED",
      isActive: true
    }
  });

  return client;
};