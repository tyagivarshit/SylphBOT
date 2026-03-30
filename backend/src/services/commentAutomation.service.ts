import prisma from "../config/prisma";
import axios from "axios";
import { decrypt } from "../utils/encrypt";
import { generateAIReply } from "./ai.service";
import { hasFeature } from "../config/plan.config";
import { incrementRate } from "../redis/rateLimiter.redis";

/* 🔥 ADDED */
import Redis from "ioredis";
const redis = new Redis(process.env.REDIS_URL as string);

interface CommentInput {
  businessId: string;
  clientId: string;
  instagramUserId: string;
  reelId: string;
  commentText: string;
}

export const handleCommentAutomation = async ({
  businessId,
  clientId,
  instagramUserId,
  reelId,
  commentText,
}: CommentInput) => {
  try {
    const text = commentText?.toLowerCase()?.trim();
    if (!text) return;

    /* ===================================================
    🔥 RATE LIMIT (SAFE)
    =================================================== */

    try {
      await incrementRate(
        businessId,
        instagramUserId,
        "COMMENT",
        60
      );
    } catch {
      console.log("🚫 Comment rate limit hit");
      return;
    }

    /* ===================================================
    🔥 SUBSCRIPTION CHECK (SAFE + CLEAN)
    =================================================== */

    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      include: { plan: true },
    });

    const plan = subscription?.plan || null;

    if (!hasFeature(plan, "automationEnabled")) {
      console.log("❌ Automation not allowed for this plan");
      return;
    }

    /* ===================================================
    🔥 FETCH TRIGGERS (WITH CACHE)
    =================================================== */

    const cacheKey = `triggers:${businessId}:${clientId}:${reelId}`;

    let triggers: any = await redis.get(cacheKey);

    if (triggers) {
      triggers = JSON.parse(triggers);
    } else {
      triggers = await prisma.commentTrigger.findMany({
        where: {
          businessId,
          clientId,
          reelId,
          isActive: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      await redis.set(cacheKey, JSON.stringify(triggers), "EX", 300);
    }

    if (!triggers.length) return;

    /* ===================================================
    🔥 MATCH TRIGGER (OPTIMIZED)
    =================================================== */

    const matchedTrigger = triggers.find((t: any) => {
      const keyword = t.keyword?.toLowerCase()?.trim();
      return keyword && text.includes(keyword);
    });

    if (!matchedTrigger) return;

    /* ===================================================
    🔥 LEAD FIND / CREATE
    =================================================== */

    let lead = await prisma.lead.findFirst({
      where: {
        businessId,
        instagramId: instagramUserId,
      },
    });

    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          businessId,
          clientId,
          instagramId: instagramUserId,
          platform: "INSTAGRAM",
          stage: "NEW",
          followupCount: 0,
        },
      });
    }

    /* ===================================================
    🔥 DUPLICATE PROTECTION (STRONG)
    =================================================== */

    const recentAIMessage = await prisma.message.findFirst({
      where: {
        leadId: lead.id,
        sender: "AI",
      },
      orderBy: { createdAt: "desc" },
    });

    if (recentAIMessage) {
      const diff =
        Date.now() - new Date(recentAIMessage.createdAt).getTime();

      if (diff < 5 * 60 * 1000) {
        console.log("🚫 Duplicate blocked");
        return;
      }
    }

    /* ===================================================
    🔥 CLIENT TOKEN
    =================================================== */

    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client?.accessToken) return;

    const accessToken = decrypt(client.accessToken);

    /* ===================================================
    🔥 AI / CUSTOM REPLY (PRIORITY FIXED)
    =================================================== */

    let replyMessage =
      matchedTrigger.dmText ||
      matchedTrigger.replyText ||
      "Thanks for your comment!";

    if (matchedTrigger.aiPrompt) {
      try {
        const aiResponse = await generateAIReply({
          businessId,
          leadId: lead.id,
          message:
            commentText +
            "\n\nContext: " +
            matchedTrigger.aiPrompt,
        });

        if (aiResponse) replyMessage = aiResponse;
      } catch {
        console.log("⚠️ AI fallback used");
      }
    }

    /* ===================================================
    🔥 COMMENT REPLY
    =================================================== */

    const commentReply =
      matchedTrigger.replyText || "Check your DM 👀";

    try {
      await axios.post(
        `https://graph.facebook.com/v19.0/${reelId}/comments`,
        { message: commentReply },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          timeout: 10000,
        }
      );
    } catch (error: any) {
      console.error(
        "❌ Comment failed:",
        error?.response?.data || error.message
      );
    }

    /* ===================================================
    🔥 DM SEND (SAFE)
    =================================================== */

    try {
      await axios.post(
        "https://graph.facebook.com/v19.0/me/messages",
        {
          recipient: { id: instagramUserId },
          message: { text: replyMessage },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );
    } catch (error: any) {
      console.error(
        "❌ DM failed:",
        error?.response?.data || error.message
      );
    }

    /* ===================================================
    🔥 SAVE MESSAGE
    =================================================== */

    await prisma.message.create({
      data: {
        leadId: lead.id,
        content: replyMessage,
        sender: "AI",
      },
    });

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        lastMessageAt: new Date(),
      },
    });

  } catch (error) {
    console.error("🚨 Comment automation error:", error);
  }
};