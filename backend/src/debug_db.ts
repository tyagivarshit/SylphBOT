import prisma from "./config/prisma";

async function main() {
  console.log("=== DB DIAGNOSTIC START ===");
  try {
    // 1. Fetch all Instagram clients
    console.log("\n--- Fetching Instagram Clients ---");
    const instagramClients = await prisma.client.findMany({
      where: { platform: "INSTAGRAM" },
    });
    console.log(`Found ${instagramClients.length} Instagram clients:`);
    for (const client of instagramClients) {
      console.log({
        id: client.id,
        businessId: client.businessId,
        platform: client.platform,
        pageId: client.pageId,
        phoneNumberId: client.phoneNumberId,
        isActive: client.isActive,
        createdAt: client.createdAt,
        accessTokenPreview: client.accessToken ? `${client.accessToken.substring(0, 15)}...` : "null",
      });
    }

    // 2. Fetch all WhatsApp clients to compare
    console.log("\n--- Fetching WhatsApp Clients ---");
    const whatsappClients = await prisma.client.findMany({
      where: { platform: "WHATSAPP" },
    });
    console.log(`Found ${whatsappClients.length} WhatsApp clients:`);
    for (const client of whatsappClients) {
      console.log({
        id: client.id,
        businessId: client.businessId,
        platform: client.platform,
        pageId: client.pageId,
        phoneNumberId: client.phoneNumberId,
        isActive: client.isActive,
      });
    }

    // 3. Recent InboundInteractions for Instagram
    console.log("\n--- Fetching Recent Instagram Inbound Interactions ---");
    const interactions = await prisma.inboundInteraction.findMany({
      where: { channel: "INSTAGRAM" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    console.log(`Found ${interactions.length} recent Instagram interactions:`);
    for (const interaction of interactions) {
      console.log({
        id: interaction.id,
        businessId: interaction.businessId,
        clientId: interaction.clientId,
        lifecycleState: interaction.lifecycleState,
        routeDecision: interaction.routeDecision,
        createdAt: interaction.createdAt,
        error: (interaction as any).error || (interaction.metadata as any)?.error || null,
      });
    }

    // 4. Check if there are human work queue entries or other relevant tables
    console.log("\n--- Fetching recent Human Work Queue items ---");
    const hwq = await prisma.humanWorkQueue.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    console.log(`Found ${hwq.length} recent Human Work Queue items:`);
    for (const item of hwq) {
      console.log({
        id: item.id,
        interactionId: item.interactionId,
        queueType: item.queueType,
        state: item.state,
        createdAt: item.createdAt,
      });
    }

  } catch (error) {
    console.error("Diagnostic script failed:", error);
  }
  console.log("\n=== DB DIAGNOSTIC END ===");
}

main().finally(() => prisma.$disconnect());
