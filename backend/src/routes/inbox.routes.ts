import { Worker } from "bullmq";
import { routeAIMessage } from "../services/aiRouter.service";
import { handleIncomingMessage } from "../services/message.service";
import * as Sentry from "@sentry/node";
import { env } from "../config/env"; 


const worker = new Worker(
  "inboxQueue",
  async (job) => {
    const { businessId, leadId, message, plan } = job.data;

    try {
      /* =================================================
      🤖 AI
      ================================================= */
      const aiResponse = await routeAIMessage({
        businessId,
        leadId,
        message,
        plan,
      });

      const aiReply =
        typeof aiResponse === "string"
          ? aiResponse
          : aiResponse?.message;

      if (!aiReply) return;

      /* =================================================
      💬 SAVE + REALTIME (USING YOUR SERVICE 🔥)
      ================================================= */
      await handleIncomingMessage({
        leadId,
        content: aiReply,
        sender: "AI",
      });

    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error("❌ Worker failed:", error.message);
        Sentry.captureException(error);
      } else {
        console.error("❌ Worker failed:", error);
      }
      throw error;
    }
  },
  {
    connection: { url: env.REDIS_URL } 
  }
);

export default worker;