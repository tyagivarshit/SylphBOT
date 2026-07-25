import { PrismaClient } from "@prisma/client";
import { enqueueInboundRouting } from "../src/queues/receptionRuntime.queue";
import { waitForRedisReady } from "../src/config/redis";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();

async function main() {
  console.log("Waiting for Redis...");
  await waitForRedisReady();
  console.log("Redis ready!");

  const ids = ["6a645b907dcdbdc764d2997a", "6a645b9a7dcdbdc764d299ac"];

  for (const id of ids) {
    console.log(`\nProcessing interaction ${id}...`);
    const interaction = await prisma.inboundInteraction.findUnique({
      where: { id },
    });

    if (!interaction) {
      console.log(`Interaction ${id} not found.`);
      continue;
    }

    console.log(`Current state: ${interaction.lifecycleState}, routeDecision: ${interaction.routeDecision}`);

    // Update state to CLASSIFIED so it can be routed again
    await prisma.inboundInteraction.update({
      where: { id },
      data: {
        lifecycleState: "CLASSIFIED",
        routeDecision: null,
      },
    });

    console.log(`Updated state in DB to CLASSIFIED. Enqueueing in inbound-routing queue...`);
    await enqueueInboundRouting({
      interactionId: interaction.id,
      traceId: interaction.traceId,
      externalInteractionKey: interaction.externalInteractionKey,
    });
    console.log("Enqueued successfully!");
  }

  await prisma.$disconnect();
}

main().catch(console.error);
