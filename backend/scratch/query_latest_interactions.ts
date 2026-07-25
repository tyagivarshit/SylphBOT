import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();

async function main() {
  console.log("Querying LATEST 10 InboundInteractions...");
  const interactions = await prisma.inboundInteraction.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 10,
  });

  console.log(`Found ${interactions.length} latest interactions:`);
  for (const item of interactions) {
    console.log(` - ID: ${item.id}`);
    console.log(`   Lead ID: ${item.leadId}`);
    console.log(`   State: ${item.lifecycleState}`);
    console.log(`   Route: ${item.routeDecision}`);
    console.log(`   Channel: ${item.channel}`);
    console.log(`   ExternalKey: ${item.externalInteractionKey}`);
    console.log(`   Payload text:`, (item.payload as any)?.message || (item.normalizedPayload as any)?.message);
    console.log(`   Created At: ${item.createdAt.toISOString()}`);
    console.log("-----------------------------------------");
  }

  await prisma.$disconnect();
}

main().catch(console.error);
