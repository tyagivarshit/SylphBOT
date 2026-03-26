import prisma from "../config/prisma";
import axios from "axios";
import { decrypt } from "../utils/encrypt";
import { generateAIReply } from "./ai.service";
import { DELAY_TIME_5 } from "bullmq";
import { incrementRate } from "../middleware/serviceRateLimiter"

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

    /* ---------------------------------------------------
    RATE LIMIT (ANTI-SPAM)
    --------------------------------------------------- */
    try {
      await incrementRate(`comment:${instagramUserId}`, 5); // 5 req/min
    } catch {
      console.log("Rate limit hit");
      return;
    }

    /* ---------------------------------------------------
    PLAN CHECK (FIXED)
    --------------------------------------------------- */
    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      include: { plan: true },
    });

    const allowedPlans = ["BASIC", "PRO", "PREMIUM"];

    if (!subscription || !allowedPlans.includes(subscription.plan?.name)) {
      console.log("Plan not allowed for comment automation");
      return;
    }

    /* ---------------------------------------------------
    FIND TRIGGERS (MULTI SUPPORT)
    --------------------------------------------------- */
    const triggers = await prisma.commentTrigger.findMany({
      where: {
        businessId,
        clientId,
        reelId,
        isActive: true,
      },
    });

    if (!triggers.length) return;

    const matchedTrigger = triggers.find((t) =>
      text.includes(t.keyword?.toLowerCase()?.trim() || "")
    );

    if (!matchedTrigger) return;

    /* ---------------------------------------------------
    LEAD FIND OR CREATE
    --------------------------------------------------- */
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

    /* ---------------------------------------------------
    DUPLICATE PROTECTION (IMPROVED)
    --------------------------------------------------- */
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

      const minutes = diff / (1000 * 60);

      if (minutes < 5) {
        console.log("Duplicate automation blocked");
        return;
      }
    }

    /* ---------------------------------------------------
    CLIENT
    --------------------------------------------------- */
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client?.accessToken) return;

    const accessToken = decrypt(client.accessToken);

    /* ---------------------------------------------------
    AI RESPONSE
    --------------------------------------------------- */
    let replyMessage =
      matchedTrigger.replyText || "Thanks for your comment!";

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

        if (aiResponse) {
          replyMessage = aiResponse;
        }
      } catch (error) {
        console.log("AI failed, using fallback");
      }
    }

    /* ---------------------------------------------------
    SMART SPLIT (COMMENT + DM)
    --------------------------------------------------- */
    const commentReply = "Check your DM 👀";
    const dmReply = replyMessage;

    /* ---------------------------------------------------
    COMMENT REPLY
    --------------------------------------------------- */
    try {
      await axios.post(
        `https://graph.facebook.com/v19.0/${reelId}/comments`,
        {
          message: commentReply,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          timeout: 10000,
        }
      );

      console.log("Instagram comment reply sent");
    } catch (error: any) {
      console.error(
        "Comment reply failed:",
        error?.response?.data || error.message
      );
    }

    /* ---------------------------------------------------
    DM SEND
    --------------------------------------------------- */
    try {
      await axios.post(
        "https://graph.facebook.com/v19.0/me/messages",
        {
          recipient: { id: instagramUserId },
          message: { text: dmReply },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );

      console.log("Instagram DM sent");
    } catch (error: any) {
      console.error(
        "DM send failed:",
        error?.response?.data || error.message
      );
    }

    /* ---------------------------------------------------
    SAVE MESSAGE
    --------------------------------------------------- */
    await prisma.message.create({
      data: {
        leadId: lead.id,
        content: dmReply,
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
    console.error("Comment automation error:", error);
  }
};