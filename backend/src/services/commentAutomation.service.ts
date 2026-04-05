import prisma from "../config/prisma";
import axios from "axios";
import { decrypt } from "../utils/encrypt";
import { generateAIReply } from "./ai.service";
import { hasFeature } from "../config/plan.config";
import { incrementRate } from "../redis/rateLimiter.redis";

import redis from "../config/redis";

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

    /* RATE LIMIT */
    try {
      await incrementRate(
        businessId,
        instagramUserId,
        "COMMENT",
        60
      );
    } catch {
      return;
    }

    /* PLAN CHECK */

    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      include: { plan: true },
    });

    const plan = subscription?.plan || null;

    if (!hasFeature(plan, "automationEnabled")) return;

    /* FETCH TRIGGERS */

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
        orderBy: { createdAt: "asc" },
      });

      await redis.set(cacheKey, JSON.stringify(triggers), "EX", 300);
    }

    if (!triggers.length) return;

    /* 🔥 MULTI KEYWORD MATCH */

    const matchedTrigger = triggers.find((t: any) => {
      const keywords = t.keyword
        ?.toLowerCase()
        ?.split(",")
        ?.map((k: string) => k.trim());

      if (!keywords?.length) return false;

      return keywords.some((k: string) => text.includes(k));
    });

    if (!matchedTrigger) return;

    /* LEAD */

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

    /* DUPLICATE PROTECTION */

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

      if (diff < 5 * 60 * 1000) return;
    }

    /* CLIENT TOKEN */

    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client?.accessToken) return;

    const accessToken = decrypt(client.accessToken);

    /* 🔥 REPLY LOGIC */

    let replyMessage =
      matchedTrigger.dmText ||
      matchedTrigger.replyText ||
      "Thanks for your comment!";

    /* 🔥 AI ONLY IF NEEDED */

    if (!matchedTrigger.dmText && matchedTrigger.aiPrompt) {
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
      } catch {}
    }

    /* COMMENT REPLY */

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
    } catch {}

    /* DM SEND */

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
    } catch {}

    /* SAVE */

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