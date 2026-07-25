import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();

async function main() {
  console.log("Querying InboundInteraction table...");
  const leadId = "6a63755aad10ed3af4d70293";
  const interactions = await prisma.inboundInteraction.findMany({
    where: {
      leadId: leadId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 10,
  });

  console.log(`Found ${interactions.length} interactions for lead ${leadId}:`);
  for (const item of interactions) {
    console.log(` - ID: ${item.id}`);
    console.log(`   State: ${item.lifecycleState}`);
    console.log(`   Route: ${item.routeDecision}`);
    console.log(`   Channel: ${item.channel}`);
    console.log(`   ExternalKey: ${item.externalInteractionKey}`);
    console.log(`   Payload text:`, (item.payload as any)?.message);
    console.log(`   Created At: ${item.createdAt.toISOString()}`);
    console.log(`   Metadata:`, JSON.stringify(item.metadata));
    console.log("-----------------------------------------");
  }

  await prisma.$disconnect();
}

main().catch(console.error);
