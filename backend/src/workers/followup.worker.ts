import { Worker } from "bullmq";
import axios from "axios";
import prisma from "../config/prisma";
import { redisConnection } from "../config/redis";
import { decrypt } from "../utils/encrypt";
import { generateAIReply } from "../services/ai.service";

new Worker(
  "followupQueue",
  async (job) => {
    try {
      const { leadId, type } = job.data;

      console.log(`⏳ Processing followup ${type} for lead ${leadId}`);

      // 1️⃣ Fetch lead
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

      // 2️⃣ Followup limit check
      if ((lead.followupCount ?? 0) >= 3) {
        console.log("🚫 Followup limit reached");
        return;
      }

      // 3️⃣ Generate AI followup
      const aiReply = await generateAIReply({
        businessId: lead.businessId,
        leadId: lead.id,
        message: `This is a ${type} follow-up. Continue conversation naturally.`,
      });

      console.log("🤖 AI Generated:", aiReply);

      // ===============================
      // 📲 WHATSAPP (UNCHANGED)
      // ===============================
      if (lead.platform === "WHATSAPP") {
        if (!lead.client.phoneNumberId) {
          console.log("❌ Client phoneNumberId missing");
          return;
        }

        if (!lead.phone) {
          console.log("❌ Lead phone missing");
          return;
        }

        const accessToken = decrypt(lead.client.accessToken);

        const response = await axios.post(
          `https://graph.facebook.com/v19.0/${lead.client.phoneNumberId}/messages`,
          {
            messaging_product: "whatsapp",
            to: lead.phone,
            type: "text",
            text: { body: aiReply },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        console.log("✅ META RESPONSE:", response.data);
      }

      // ===============================
      // 📸 INSTAGRAM FOLLOWUP (NEW)
      // ===============================
      else if (lead.platform === "INSTAGRAM") {
        if (!lead.client.pageId) {
          console.log("❌ Client pageId missing");
          return;
        }

        if (!lead.instagramId) {
          console.log("❌ Lead instagramId missing");
          return;
        }

        const accessToken = decrypt(lead.client.accessToken);

        const response = await axios.post(
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
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        console.log("✅ INSTAGRAM FOLLOWUP SENT:", response.data);
      }

      // 5️⃣ Store AI message
      await prisma.message.create({
        data: {
          content: aiReply,
          sender: "AI",
          leadId: lead.id,
        },
      });

      // 6️⃣ Update followup count
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          followupCount: { increment: 1 },
        },
      });

      console.log(`✅ Followup ${type} sent successfully`);
    } catch (err: any) {
      console.log("🚨 FOLLOWUP WORKER ERROR:");
      console.log(err.response?.data || err.message || err);
    }
  },
  {
    connection: redisConnection,
  }
);

console.log("🚀 Followup Worker Started");