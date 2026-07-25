import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { getSubscriptionAccess } from "../middleware/subscriptionGuard.middleware";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  try {
    const businessId = "6a53cbc44e5ccd9c218a49e3";
    console.log("Checking subscription access for businessId:", businessId);
    
    const access = await getSubscriptionAccess(businessId);
    console.log("Subscription access result:", JSON.stringify(access, null, 2));

    const ledger = await prisma.subscriptionLedger.findFirst({
      where: { businessId },
      orderBy: { updatedAt: "desc" },
    });
    console.log("Prisma subscription ledger record:", JSON.stringify(ledger, null, 2));

  } catch (err) {
    console.error("Diagnostic error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
