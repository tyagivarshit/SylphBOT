import axios from "axios";
import prisma from "../config/prisma";
import { decrypt } from "../utils/encrypt";

/* ===================================================== */
export interface OwnerNotificationPayload {
  businessId: string;
  leadId: string;
  slot?: Date;
  type?: "CONFIRMED" | "CANCELLED" | "RESCHEDULED";
}

/* ===================================================== */
export const sendOwnerWhatsAppNotification = async (
  data: OwnerNotificationPayload
) => {
  const { businessId, leadId, slot, type } = data;

  try {
    console.log("📤 Sending owner WhatsApp notification...");

    /* =====================================================
    FETCH BUSINESS
    ===================================================== */
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

    /* =====================================================
    FORMAT PHONE
    ===================================================== */
    const formattedPhone = ownerPhone.replace(/\D/g, "");

    const finalPhone =
      formattedPhone.startsWith("91")
        ? formattedPhone
        : `91${formattedPhone}`;

    /* =====================================================
    TOKEN
    ===================================================== */
    const accessToken = decrypt(whatsappClient.accessToken);

    /* =====================================================
    LEAD DATA
    ===================================================== */
    const lead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        businessId,
      },
    });

    /* =====================================================
    🧠 MESSAGE BASED ON TYPE
    ===================================================== */
    let messageText = "";

    if (type === "CONFIRMED") {
      messageText = `📅 New Booking!\n\n👤 ${lead?.name || "Customer"}\n📞 ${
        lead?.phone || "N/A"
      }\n🕒 ${slot?.toLocaleString()}`;
    }

    else if (type === "CANCELLED") {
      messageText = `❌ Booking Cancelled\n\n👤 ${lead?.name || "Customer"}\n📞 ${
        lead?.phone || "N/A"
      }`;
    }

    else if (type === "RESCHEDULED") {
      messageText = `🔁 Booking Rescheduled\n\n👤 ${
        lead?.name || "Customer"
      }\n📞 ${lead?.phone || "N/A"}\n🕒 ${
        slot?.toLocaleString() || "Updated time"
      }`;
    }

    else {
      messageText = `📩 Booking Update\n\n👤 ${lead?.name || "Customer"}`;
    }

    /* =====================================================
    TEMPLATE BODY PARAMS (SAFE)
    ===================================================== */
    const bodyParams = [
      lead?.name || "Customer",
      lead?.phone || "N/A",
      slot ? slot.toLocaleString() : "-",
    ];

    const templatePayload = {
      messaging_product: "whatsapp",
      to: finalPhone,
      type: "template",
      template: {
        name: "booking_notification",
        language: { code: "en" },
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

    let res;

    /* =====================================================
    TRY TEMPLATE
    ===================================================== */
    try {
      res = await axios.post(
        `https://graph.facebook.com/v19.0/${whatsappClient.phoneNumberId}/messages`,
        templatePayload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );

      console.log("✅ WhatsApp TEMPLATE sent:", res.data);

    } catch (err: any) {

      console.error("⚠️ Template failed, sending fallback");

      if (err.response) {
        console.error("📛 META TEMPLATE ERROR:", err.response.data);
      }

      /* =====================================================
      FALLBACK TEXT MESSAGE
      ===================================================== */
      res = await axios.post(
        `https://graph.facebook.com/v19.0/${whatsappClient.phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          to: finalPhone,
          type: "text",
          text: {
            body: messageText,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          timeout: 10000,
        }
      );

      console.log("✅ WhatsApp FALLBACK sent:", res.data);
    }

  } catch (error: any) {
    console.error("❌ OWNER NOTIFY ERROR");

    if (error.response) {
      console.error("📛 META ERROR:", error.response.data);
    } else {
      console.error(error.message);
    }
  }
};
