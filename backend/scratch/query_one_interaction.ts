import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();

async function main() {
  const ids = ["6a645b907dcdbdc764d2997a", "6a645b9a7dcdbdc764d299ac"];
  for (const id of ids) {
    const item = await prisma.inboundInteraction.findUnique({
      where: { id },
    });
    if (item) {
      console.log(`=== Interaction ${id} ===`);
      console.log("Text:", (item.normalizedPayload as any)?.message);
      console.log("Routing Decision:", JSON.stringify((item.metadata as any)?.routingDecision, null, 2));
      console.log("Control Gate:", JSON.stringify((item.metadata as any)?.controlGate, null, 2));
      console.log("Consent:", JSON.stringify((item.metadata as any)?.consent, null, 2));
      console.log("Escalation:", JSON.stringify((item.metadata as any)?.escalation, null, 2));
    } else {
      console.log(`Interaction ${id} not found`);
    }
  }
  await prisma.$disconnect();
}

main().catch(console.error);
