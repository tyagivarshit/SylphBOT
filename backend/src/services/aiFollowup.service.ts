import { sendWhatsAppMessage } from "./whatsapp.service";
import prisma from "../config/prisma";

/*
=========================================================
AI FOLLOWUP ENGINE
=========================================================
*/

export const sendAIFollowup = async (leadId: string) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead?.phone) return;

    const message = `Hey ${lead.name || ""} 👋

Just checking in!

Would you like to:
1. Book a call
2. Know more
3. Talk to a human

Reply with 1, 2, or 3 👍`;

    await sendWhatsAppMessage({
      to: lead.phone,
      message,
    });

  } catch (err) {
    console.error("❌ AI FOLLOWUP ERROR:", err);
  }
};