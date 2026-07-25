import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();

async function main() {
  const businessId = "6a53cbc44e5ccd9c218a49e3";
  const leadId = "6a63755aad10ed3af4d70293";
  const asOf = new Date();

  const [
    policy,
    overrides,
    predictions,
    businessPredictions,
    anomalies,
  ] = await Promise.all([
    prisma.intelligencePolicy.findFirst({
      where: {
        businessId,
        isActive: true,
        effectiveFrom: {
          lte: asOf,
        },
      },
    }),
    prisma.manualIntelligenceOverride.findMany({
      where: {
        businessId,
        isActive: true,
        expiresAt: {
          gt: asOf,
        },
      },
    }),
    prisma.predictionLedger.findMany({
      where: {
        businessId,
        entityType: "LEAD",
        entityId: leadId,
      },
    }),
    prisma.predictionLedger.findMany({
      where: {
        businessId,
        entityType: "LEAD",
      },
    }),
    prisma.anomalyLedger.findMany({
      where: {
        businessId,
        status: {
          in: ["OPEN", "SUPPRESSED"],
        },
      },
    }),
  ]);

  console.log("Policy:", policy);
  console.log("Overrides length:", overrides.length);
  console.log("Anomalies length:", anomalies.length);
  console.log("Predictions length:", predictions.length);
  console.log("Business Predictions length:", businessPredictions.length);
  
  await prisma.$disconnect();
}

main().catch(console.error);
