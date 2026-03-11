import prisma from "../config/prisma";
import axios from "axios";
import { decrypt } from "../utils/encrypt";
import { generateAIReply } from "./ai.service";

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

    /* ---------------------------------------------------
    PLAN CHECK (BASIC ONLY)
    --------------------------------------------------- */

    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      include: { plan: true },
    });

    if (!subscription || subscription.plan?.name !== "BASIC") {
      console.log("Comment automation allowed only for BASIC plan");
      return;
    }

    /* ---------------------------------------------------
    FIND TRIGGER
    --------------------------------------------------- */

    const trigger = await prisma.commentTrigger.findFirst({
      where: {
        businessId,
        clientId,
        reelId,
        isActive: true,
      },
    });

    if (!trigger) return;

    const keyword = trigger.keyword.toLowerCase().trim();
    const text = commentText.toLowerCase().trim();

    if (!text.includes(keyword)) return;

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
    DUPLICATE SPAM PROTECTION
    --------------------------------------------------- */

    const recentAIMessage = await prisma.message.findFirst({
      where: {
        leadId: lead.id,
        content: trigger.replyText,
        sender: "AI",
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (recentAIMessage) {

      const diff =
        Date.now() - new Date(recentAIMessage.createdAt).getTime();

      const minutes = diff / (1000 * 60);

      if (minutes < 60) {
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

    if (!client) return;

    const accessToken = decrypt(client.accessToken);

    /* ---------------------------------------------------
    AI PROMPT SUPPORT
    --------------------------------------------------- */

    let replyMessage = trigger.replyText;

    if (trigger.aiPrompt) {

      try {

        const aiResponse = await generateAIReply({
          businessId,
          leadId: lead.id,
          message:
            commentText +
            "\n\nContext: " +
            trigger.aiPrompt,
        });

        if (aiResponse) {
          replyMessage = aiResponse;
        }

      } catch (err) {
        console.log("AI prompt failed, using default reply");
      }

    }

    /* ---------------------------------------------------
    COMMENT REPLY
    --------------------------------------------------- */

    try {

      await axios.post(
        `https://graph.facebook.com/v19.0/${reelId}/comments`,
        {
          message: replyMessage,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      console.log("Instagram comment reply sent");

    } catch (err) {

      console.log("Comment reply failed");

    }

    /* ---------------------------------------------------
    DM SEND
    --------------------------------------------------- */

    try {

      await axios.post(
        "https://graph.facebook.com/v19.0/me/messages",
        {
          recipient: {
            id: instagramUserId,
          },
          message: {
            text: replyMessage,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log("Instagram DM sent");

    } catch (err) {

      console.log("DM send failed");

    }

    /* ---------------------------------------------------
    SAVE MESSAGE IN CRM
    --------------------------------------------------- */

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

    console.error("Comment automation error:", error);

  }

};