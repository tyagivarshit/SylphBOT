import prisma from "../src/config/prisma";
import { getIntelligenceRuntimeInfluence } from "../src/services/intelligence/intelligenceRuntimeInfluence.service";

async function main() {
  const businessId = "6a53cbc44e5ccd9c218a49e3";
  const leadId = "6a63755aad10ed3af4d70293";

  console.log("=== INTELLIGENCE INFLUENCE INSPECTION ===");

  try {
    const influence = await getIntelligenceRuntimeInfluence({
      businessId,
      leadId,
    });
    console.log("\n--- Intelligence Runtime Influence Result ---");
    console.log(JSON.stringify(influence, null, 2));

    // Also let's inspect policy and featureSnapshot directly
    const policy = await prisma.intelligencePolicy.findFirst({
      where: { businessId, isActive: true },
    });
    console.log("\n--- Active Intelligence Policy ---");
    console.log(JSON.stringify(policy, null, 2));

    const snapshot = await prisma.featureSnapshotLedger.findFirst({
      where: { businessId },
      orderBy: { snapshotAt: "desc" },
    });
    console.log("\n--- Feature Snapshot ---");
    console.log(JSON.stringify(snapshot, null, 2));

    const overrides = await prisma.manualIntelligenceOverride.findMany({
      where: { businessId, isActive: true },
    });
    console.log("\n--- Manual Overrides ---");
    console.log(JSON.stringify(overrides, null, 2));

  } catch (error) {
    console.error("Failed to fetch influence:", error);
  }
}

main().finally(() => prisma.$disconnect());
