import { Worker } from "bullmq";
import axios from "axios";
import prisma from "../config/prisma";
import { redisConnection } from "../config/redis";
import { decrypt } from "../utils/encrypt";
import { generateAIReply } from "../services/ai.service";
import { getIO } from "../sockets/socket.server";

new Worker(
  "followupQueue",
  async (job) => {

    try {

      const { leadId, type } = job.data;

      console.log(`⏳ Processing followup ${type} for lead ${leadId}`);

      /* FETCH LEAD */

      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: { client: true },
      });

      if (!lead) {
        console.log("❌ Lead not found");
        return;
      }

      if (!lead.client) {
        console.log("❌ Client not found for lead");
        return;
      }

      /* STOP FOLLOWUPS IF USER REPLIED */

      if (lead.unreadCount > 0) {
        console.log("🛑 Lead already replied, skipping followup");
        return;
      }

      /* FOLLOWUP LIMIT */

      if ((lead.followupCount ?? 0) >= 3) {
        console.log("🚫 Followup limit reached");
        return;
      }

      /* GENERATE AI FOLLOWUP */

      const aiReply = await generateAIReply({
        businessId: lead.businessId,
        leadId: lead.id,
        message: `This is a ${type} follow-up. Continue conversation naturally.`,
      });

      console.log("🤖 AI Generated:", aiReply);

      const accessToken = decrypt(lead.client.accessToken);

      /* SEND MESSAGE */

      if (lead.platform === "WHATSAPP") {

        if (!lead.client.phoneNumberId || !lead.phone) {
          console.log("❌ WhatsApp data missing");
          return;
        }

        await axios.post(
          `https://graph.facebook.com/v19.0/${lead.client.phoneNumberId}/messages`,
          {
            messaging_product: "whatsapp",
            to: lead.phone,
            type: "text",
            text: { body: aiReply },
          },
          {
            timeout: 10000,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

      }

      else if (lead.platform === "INSTAGRAM") {

        if (!lead.client.pageId || !lead.instagramId) {
          console.log("❌ Instagram data missing");
          return;
        }

        await axios.post(
          `https://graph.facebook.com/v19.0/${lead.client.pageId}/messages`,
          {
            recipient: {
              id: lead.instagramId,
            },
            message: {
              text: aiReply,
            },
          },
          {
            timeout: 10000,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

      }

      /* SAVE MESSAGE */

      const aiMessage = await prisma.message.create({
        data: {
          leadId: lead.id,
          content: aiReply,
          sender: "AI",
        },
      });

      /* SOCKET EVENT */

      try {

        const io = getIO();

        io.to(`lead_${lead.id}`).emit("new_message", aiMessage);

      } catch {}

      /* UPDATE FOLLOWUP STATE */

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          followupCount: { increment: 1 },
          lastFollowupAt: new Date(),
        },
      });

      console.log(`✅ Followup ${type} sent successfully`);

    } catch (err: any) {

      console.log("🚨 FOLLOWUP WORKER ERROR:");

      console.log(
        err.response?.data ||
        err.message ||
        err
      );

      throw err;

    }

  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

console.log("🚀 Followup Worker Started");