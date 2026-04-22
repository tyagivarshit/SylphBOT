import cron from "node-cron";
import prisma from "../config/prisma";
import { checkConnectionHealth } from "../services/connectionHealth.service";

const log = (...args: any[]) => {
  console.log("[CONNECTION HEALTH CRON]", ...args);
};

export const startConnectionHealthCron = () => {
  log("Connection health cron started");

  cron.schedule("0 */6 * * *", async () => {
    try {
      const clients = await prisma.client.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          platform: {
            in: ["INSTAGRAM", "WHATSAPP"],
          },
        },
        select: {
          id: true,
          platform: true,
          accessToken: true,
          isActive: true,
        },
      });

      if (!clients.length) {
        return;
      }

      let inactiveCount = 0;

      for (const client of clients) {
        const healthy = await checkConnectionHealth(client);

        if (!healthy) {
          inactiveCount += 1;
        }
      }

      log("Connection health cycle complete", {
        checked: clients.length,
        inactive: inactiveCount,
      });
    } catch (error) {
      console.error("[CONNECTION HEALTH CRON] Failed:", error);
    }
  });
};
