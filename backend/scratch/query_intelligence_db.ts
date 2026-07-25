import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();

async function main() {
  const businessId = "6a53cbc44e5ccd9c218a49e3";

  console.log("=== Querying Intelligence Anomalies ===");
  const anomalies = await prisma.anomalyLedger.findMany({
    where: { businessId },
  });
  console.log(`Found ${anomalies.length} anomalies:`);
  for (const a of anomalies) {
    console.log(` - ID: ${a.id}, Key: ${a.anomalyKey}, Type: ${a.anomalyType}, Status: ${a.status}, Severity: ${a.severity}`);
  }

  console.log("\n=== Querying Intelligence Overrides ===");
  const overrides = await prisma.manualIntelligenceOverride.findMany({
    where: { businessId },
  });
  console.log(`Found ${overrides.length} overrides:`);
  for (const o of overrides) {
    console.log(` - ID: ${o.id}, Scope: ${o.scope}, Key: ${o.overrideKey}, Action: ${o.action}, IsActive: ${o.isActive}, ExpiresAt: ${o.expiresAt}`);
  }

  console.log("\n=== Querying Intelligence Predictions ===");
  const predictions = await prisma.predictionLedger.findMany({
    where: { businessId },
  });
  console.log(`Found ${predictions.length} predictions:`);
  for (const p of predictions) {
    console.log(` - ID: ${p.id}, EntityId: ${p.entityId}, EntityType: ${p.entityType}, Type: ${p.predictionType}, Score: ${p.score}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
