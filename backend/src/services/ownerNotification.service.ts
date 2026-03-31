import axios from "axios";
import prisma from "../config/prisma";
import { decrypt } from "../utils/encrypt";

export const sendOwnerWhatsAppNotification = async ({
  businessId,
  leadId,
  slot,
}: {
  businessId: string;
  leadId: string;
  slot: Date;
}) => {
  try {
    console.log("📤 Sending owner WhatsApp notification...");

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        owner: true,
        clients: true,
      },
    });

    if (!business) {
      console.log("❌ No business found");
      return;
    }

    const ownerPhone = business.owner?.phone;

    const whatsappClient = business.clients.find(
      (c) => c.platform === "WHATSAPP"
    );

    if (!ownerPhone || !whatsappClient) {
      console.log("❌ Missing owner phone or WhatsApp client");
      return;
    }

    const accessToken = decrypt(whatsappClient.accessToken);

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    /* 🔥 FIX: PHONE FORMAT (NO + SIGN) */
    const formattedPhone = ownerPhone.replace(/\D/g, "");

    /* 🔥 TEMPLATE DATA */
    const bodyParams = [
      lead?.name || "Customer",
      lead?.phone || "N/A",
      slot.toLocaleString(),
    ];

    const payload = {
      messaging_product: "whatsapp",
      to: formattedPhone,
      type: "template",
      template: {
        name: "booking_notification", // 👈 exact template name
        language: {
          code: "en",
        },
        components: [
          {
            type: "body",
            parameters: bodyParams.map((text) => ({
              type: "text",
              text,
            })),
          },
        ],
      },
    };

    console.log("📦 PAYLOAD:", payload);

    const res = await axios.post(
      `https://graph.facebook.com/v19.0/${whatsappClient.phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ WhatsApp sent:", res.data);

  } catch (error: any) {
    console.error("❌ OWNER NOTIFY ERROR");

    if (error.response) {
      console.error("📛 META ERROR:", error.response.data);
    } else {
      console.error(error.message);
    }
  }
};