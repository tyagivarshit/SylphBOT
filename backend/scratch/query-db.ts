import prisma from "../src/config/prisma";

async function main() {
  const result = await prisma.inboundInteraction.findMany({
    orderBy: { createdAt: "desc" },
    take: 3
  });
  console.log("RESULT:", JSON.stringify(result, null, 2));
}

main().catch(console.error);
