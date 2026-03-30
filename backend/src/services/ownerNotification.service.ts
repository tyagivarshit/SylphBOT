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
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        owner: true,
        clients: true,
      },
    });

    if (!business) return;

    const ownerPhone = business.owner?.phone;

    const whatsappClient = business.clients.find(
      (c) => c.platform === "WHATSAPP"
    );

    if (!ownerPhone || !whatsappClient) return;

    const accessToken = decrypt(whatsappClient.accessToken);

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    const message = `🔥 New Booking Confirmed!

👤 ${lead?.name || "Customer"}
📞 ${lead?.phone || "N/A"}

📅 ${slot.toLocaleDateString()}
⏰ ${slot.toLocaleTimeString()}

Be ready 👍`;

    await axios.post(
      `https://graph.facebook.com/v19.0/${whatsappClient.phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: ownerPhone,
        type: "text",
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

  } catch (error) {
    console.error("OWNER NOTIFY ERROR", error);
  }
};