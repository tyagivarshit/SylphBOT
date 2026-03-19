import prisma from "../config/prisma";

export const getOrCreateClient = async (businessId: string) => {

  let client = await prisma.client.findFirst({
    where: { businessId, isActive: true }
  });

  if (!client) {

    client = await prisma.client.create({
      data: {
        businessId,
        platform: "SYSTEM",
        accessToken: "AUTO_GENERATED",
        isActive: true
      }
    });

    console.log("✅ Auto-created client for business:", businessId);
  }

  return client;
};