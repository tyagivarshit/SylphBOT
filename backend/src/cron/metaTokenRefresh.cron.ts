import cron from "node-cron";
import axios from "axios";
import prisma from "../config/prisma";
import { encrypt, decrypt } from "../utils/encrypt";

const log = (...args: any[]) => {
  console.log("[META TOKEN CRON]", ...args);
};

export const startMetaTokenRefreshCron = () => {

  log("Meta token refresh cron started");

  /* 
  ---------------------------------------------------
  RUN EVERY DAY AT 3 AM
  ---------------------------------------------------
  */

  cron.schedule("0 3 * * *", async () => {

    try {

      log("Checking Instagram tokens...");

      const clients = await prisma.client.findMany({
        where: {
          platform: "INSTAGRAM",
          isActive: true,
        },
      });

      for (const client of clients) {

        try {

          const currentToken = decrypt(client.accessToken);

          const response = await axios.get(
            "https://graph.facebook.com/v19.0/oauth/access_token",
            {
              params: {
                grant_type: "fb_exchange_token",
                client_id: process.env.META_APP_ID,
                client_secret: process.env.META_APP_SECRET,
                fb_exchange_token: currentToken,
              },
            }
          );

          const newToken = response.data.access_token;

          if (!newToken) {
            log("Token refresh failed for client:", client.id);
            continue;
          }

          const encrypted = encrypt(newToken);

          await prisma.client.update({
            where: { id: client.id },
            data: {
              accessToken: encrypted,
            },
          });

          log("Token refreshed:", client.id);

        } catch (err: any) {

          log(
            "Refresh error for client:",
            client.id,
            err.response?.data || err.message
          );

        }

      }

      log("Token refresh cycle complete");

    } catch (error) {

      log("Cron failed:", error);

    }

  });

};