import { Worker } from "bullmq";
import { routeAIMessage } from "../services/aiRouter.service";
import { handleIncomingMessage } from "../services/message.service";
import * as Sentry from "@sentry/node";
const url = new URL(process.env.REDIS_URL!);

const connection = {
  host: url.hostname,
  port: Number(url.port),
  username: "default",
  password: url.password,
  tls: {},
};


const worker = new Worker(
  "inboxQueue",
  async (job) => {
    const { businessId, leadId, message, plan } = job.data;

    try {
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
  { connection: connection }
);

export default worker;