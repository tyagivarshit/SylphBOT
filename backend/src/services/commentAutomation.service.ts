import prisma from "../config/prisma";
import axios from "axios";
import { decrypt } from "../utils/encrypt";
import { generateAIReply } from "./ai.service";
import { hasFeature } from "../config/plan.config";
import { incrementRate } from "../redis/rateLimiter.redis";
import {
  finalizeAIUsageExecution,
  releaseAIUsageExecution,
  reserveAIUsageExecution,
  reserveUsage,
  runWithContactUsageLimit,
} from "./usage.service";

import redis from "../config/redis";

interface CommentInput {
  businessId: string;
  clientId: string;
  instagramUserId: string;
  reelId: string;
  commentText: string;
}

type CommentAutomationResult = {
  executed: boolean;
  messageSent: boolean;
};

const buildCommentAIMessage = (
  commentText: string,
  aiPrompt?: string | null
) => {
  const sections = [`Lead message:\n${String(commentText || "").trim()}`];
  const prompt = String(aiPrompt || "").trim();

  if (prompt) {
    sections.push(`Reply instruction:\n${prompt}`);
  }

  return sections.join("\n\n");
};

export const handleCommentAutomation = async ({
  businessId,
  clientId,
  instagramUserId,
  reelId,
  commentText,
}: CommentInput): Promise<CommentAutomationResult> => {
  let executed = false;
  let messageSent = false;

  try {
    const text = commentText?.toLowerCase()?.trim();
    if (!text) {
      return { executed, messageSent };
    }

    try {
      await incrementRate(businessId, instagramUserId, "COMMENT", 60);
    } catch {
      return { executed, messageSent };
    }

    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      include: { plan: true },
    });

    const plan = subscription?.plan || null;

    if (!hasFeature(plan, "automationEnabled")) {
      return { executed, messageSent };
    }

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

    if (!triggers.length) {
      return { executed, messageSent };
    }

    const matchedTrigger = triggers.find((trigger: any) => {
      const keywords = trigger.keyword
        ?.toLowerCase()
        ?.split(",")
        ?.map((keyword: string) => keyword.trim());

      if (!keywords?.length) return false;

      return keywords.some((keyword: string) => text.includes(keyword));
    });

    if (!matchedTrigger) {
      return { executed, messageSent };
    }

    let lead = await prisma.lead.findFirst({
      where: {
        businessId,
        instagramId: instagramUserId,
      },
    });

    if (!lead) {
      const createdLead = await runWithContactUsageLimit(
        businessId,
        (tx) =>
          tx.lead.create({
            data: {
              businessId,
              clientId,
              instagramId: instagramUserId,
              platform: "INSTAGRAM",
              stage: "NEW",
              followupCount: 0,
            },
          })
      ).catch((error) => {
        if ((error as { code?: string })?.code === "LIMIT_REACHED") {
          return null;
        }

        throw error;
      });

      if (!createdLead) {
        return { executed, messageSent };
      }

      lead = createdLead.result;
    }

    const recentAIMessage = await prisma.message.findFirst({
      where: {
        leadId: lead.id,
        sender: "AI",
      },
      orderBy: { createdAt: "desc" },
    });

    if (recentAIMessage) {
      const diff = Date.now() - new Date(recentAIMessage.createdAt).getTime();

      if (diff < 5 * 60 * 1000) {
        return { executed, messageSent };
      }
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client?.accessToken) {
      return { executed, messageSent };
    }

    const accessToken = decrypt(client.accessToken);

    let replyMessage =
      matchedTrigger.dmText ||
      matchedTrigger.replyText ||
      "Thanks for your comment!";

    if (!matchedTrigger.dmText && matchedTrigger.aiPrompt) {
      let aiReservation:
        | Awaited<ReturnType<typeof reserveAIUsageExecution>>
        | null = null;

      try {
        aiReservation = await reserveAIUsageExecution({
          businessId,
        });

        const aiResponse = await generateAIReply({
          businessId,
          leadId: lead.id,
          message: buildCommentAIMessage(
            commentText,
            matchedTrigger.aiPrompt
          ),
          source: "COMMENT_AUTOMATION",
        });

        if (aiResponse) {
          replyMessage = aiResponse;
          await finalizeAIUsageExecution(aiReservation);
          aiReservation = null;
        } else if (aiReservation) {
          await releaseAIUsageExecution(aiReservation);
          aiReservation = null;
        }
      } catch (error) {
        if (aiReservation) {
          await releaseAIUsageExecution(aiReservation).catch(() => undefined);
        }

        if (
          (error as { code?: string })?.code !== "LIMIT_REACHED" &&
          (error as { code?: string })?.code !== "HOURLY_LIMIT_REACHED" &&
          (error as { code?: string })?.code !== "USAGE_CHECK_FAILED"
        ) {
          console.error("Comment automation AI fallback error:", error);
        }
      }
    }

    try {
      await reserveUsage({
        businessId,
        feature: "automation_runs",
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "LIMIT_REACHED") {
        return { executed, messageSent };
      }

      throw error;
    }

    executed = true;

    const commentReply = matchedTrigger.replyText || "Check your DM";

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

    try {
      await reserveUsage({
        businessId,
        feature: "messages_sent",
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "LIMIT_REACHED") {
        return { executed, messageSent };
      }

      throw error;
    }

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
      messageSent = true;
    } catch {
      return { executed, messageSent };
    }

    if (messageSent) {
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
    }

    return {
      executed,
      messageSent,
    };
  } catch (error) {
    console.error("Comment automation error:", error);
    return {
      executed,
      messageSent,
    };
  }
};
