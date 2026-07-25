import prisma from "../config/prisma";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

async function main() {
  const businessId = "6a53cbc44e5ccd9c218a49e3";
  const platform = "SYSTEM";
  const phoneNumberId = `__system_phone__:${businessId}`;
  const pageId = `__system_page__:${businessId}`;

  console.log("Trying to findUnique...");
  const existing = await prisma.client.findUnique({
    where: {
      businessId_platform: {
        businessId,
        platform,
      },
    },
  });
  console.log("findUnique result:", existing);

  if (existing) {
    console.log("Existing client found, exiting...");
    return;
  }

  console.log("Trying to create...");
  try {
    const res = await prisma.client.create({
      data: {
        businessId,
        platform,
        phoneNumberId,
        pageId,
        accessToken: "AUTO_GENERATED",
        isActive: true,
      },
    });
    console.log("create result:", res);
  } catch (err: any) {
    console.error("create error:", err);
  }
}

main();
