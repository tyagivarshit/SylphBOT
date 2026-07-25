import { PrismaClient } from "@prisma/client";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$connect();
    console.log("Successfully connected to DB");
    
    // Find all clients in the DB
    const clients = await prisma.client.findMany();
    console.log(`Total clients found: ${clients.length}`);
    for (const c of clients) {
      console.log({
        id: c.id,
        businessId: c.businessId,
        platform: c.platform,
        phoneNumberId: c.phoneNumberId,
        pageId: c.pageId,
        isActive: c.isActive,
      });
    }

    // Find all businesses
    const businesses = await prisma.business.findMany();
    console.log(`Total businesses found: ${businesses.length}`);
    for (const b of businesses) {
      console.log({
        id: b.id,
        name: b.name,
      });
    }
  } catch (err) {
    console.error("Error running script:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
