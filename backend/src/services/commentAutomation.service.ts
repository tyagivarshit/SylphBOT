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
import { getCanonicalSubscriptionSnapshot } from "./subscriptionAuthority.service";

import redis from "../config/redis";

interface CommentInput {
  businessId: string;
  clientId: string;
  instagramUserId?: string;
  reelId?: string;
  commentText?: string;
  commentId?: string;
  senderId?: string;
  mediaId?: string;
  text?: string;
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
  commentId,
  senderId,
  mediaId,
  text,
}: CommentInput): Promise<CommentAutomationResult> => {
  let executed = false;
  let messageSent = false;

  try {
    const normalizedCommentText = String(commentText || text || "").trim();
    const normalizedText = normalizedCommentText.toLowerCase();
    const normalizedInstagramUserId = String(
      instagramUserId || senderId || ""
    ).trim();
    const normalizedReelId = String(reelId || mediaId || "").trim();
    const normalizedCommentId = String(commentId || "").trim();

    console.log("⚙️ Comment automation service received job", {
      businessId,
      clientId,
      commentId: normalizedCommentId || null,
      mediaId: normalizedReelId || null,
      senderId: normalizedInstagramUserId || null,
    });

    if (!normalizedText || !normalizedInstagramUserId || !normalizedReelId) {
      console.log("Comment automation skipped due to missing payload", {
        businessId,
        clientId,
        commentId: normalizedCommentId || null,
        mediaId: normalizedReelId || null,
        senderId: normalizedInstagramUserId || null,
        hasText: Boolean(normalizedText),
      });
      return { executed, messageSent };
    }

    try {
      await incrementRate(businessId, normalizedInstagramUserId, "COMMENT", 60);
    } catch {
      return { executed, messageSent };
    }

    const subscription = await getCanonicalSubscriptionSnapshot(businessId);

    const plan = subscription?.plan || null;

    if (!hasFeature(plan, "automationEnabled")) {
      return { executed, messageSent };
    }

    const cacheKey = `triggers:${businessId}:${clientId}:${normalizedReelId}`;

    let triggers: any = await redis.get(cacheKey);

    if (triggers) {
      triggers = JSON.parse(triggers);
    } else {
      triggers = await prisma.commentTrigger.findMany({
        where: {
          businessId,
          clientId,
          reelId: normalizedReelId,
          isActive: true,
        },
        orderBy: { createdAt: "asc" },
      });

      await redis.set(cacheKey, JSON.stringify(triggers), "EX", 300);
    }

    if (!triggers.length) {
      console.log("No comment automation triggers found", {
        businessId,
        clientId,
        reelId: normalizedReelId,
      });
      return { executed, messageSent };
    }

    console.log("🧠 CHECKING TRIGGERS FOR:", normalizedCommentText);

    const matchedTrigger = triggers.find((trigger: any) => {
      const keywords = trigger.keyword
        ?.toLowerCase()
        ?.split(",")
        ?.map((keyword: string) => keyword.trim());

      if (!keywords?.length) return false;

      return keywords.some((keyword: string) => normalizedText.includes(keyword));
    });

    if (!matchedTrigger) {
      console.log("❌ NO TRIGGER MATCH");
      console.log("No comment automation trigger matched", {
        businessId,
        clientId,
        reelId: normalizedReelId,
        commentId: normalizedCommentId || null,
      });
      return { executed, messageSent };
    }

    console.log("✅ TRIGGER MATCHED", matchedTrigger.keyword);

    console.log("🧠 Trigger matched", {
      triggerId: matchedTrigger.id,
      keyword: matchedTrigger.keyword,
      commentId: normalizedCommentId || null,
      businessId,
    });

    let lead = await prisma.lead.findFirst({
      where: {
        businessId,
        instagramId: normalizedInstagramUserId,
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
              instagramId: normalizedInstagramUserId,
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
            normalizedCommentText,
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
      console.log("📤 SENDING COMMENT REPLY", {
        commentId: normalizedCommentId || null,
        message: commentReply,
      });

      if (normalizedCommentId) {
        console.log("📤 Sending IG comment reply", normalizedCommentId);

        const response = await axios.post(
          `https://graph.facebook.com/v19.0/${normalizedCommentId}/replies`,
          { message: commentReply },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            timeout: 10000,
          }
        );

        console.log("✅ META RESPONSE SUCCESS", response.data);

        console.log("✅ IG comment reply sent", {
          commentId: normalizedCommentId,
          businessId,
        });
      } else {
        console.log("📤 Sending IG comment reply", normalizedReelId);

        const response = await axios.post(
          `https://graph.facebook.com/v19.0/${normalizedReelId}/comments`,
          { message: commentReply },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            timeout: 10000,
          }
        );

        console.log("✅ META RESPONSE SUCCESS", response.data);

        console.log("✅ IG media comment sent", {
          reelId: normalizedReelId,
          businessId,
        });
      }
    } catch (error: any) {
      console.error(
        "❌ META RESPONSE ERROR",
        error?.response?.data || error?.message
      );
      console.error("❌ IG comment reply failed", {
        businessId,
        clientId,
        commentId: normalizedCommentId || null,
        reelId: normalizedReelId,
        error: error?.response?.data || error?.message || error,
      });
    }

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
          recipient: { id: normalizedInstagramUserId },
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
      console.log("✅ IG DM sent from comment automation", {
        businessId,
        clientId,
        senderId: normalizedInstagramUserId,
      });
    } catch (error: any) {
      console.error("❌ IG DM send failed from comment automation", {
        businessId,
        clientId,
        senderId: normalizedInstagramUserId,
        error: error?.response?.data || error?.message || error,
      });
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

    console.log("🏁 COMMENT AUTOMATION FLOW COMPLETED");

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
