import Twilio from "twilio";
import { env } from "../config/env";

/*
=========================================================
WHATSAPP SERVICE (PRODUCTION READY)
Supports:
- Text messages
- Fail-safe handling
- Logging
=========================================================
*/

// 🔥 Init Twilio
const client = Twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

interface WhatsAppPayload {
  to: string;
  message: string;
}

/*
=========================================================
FORMAT PHONE NUMBER (IMPORTANT)
=========================================================
*/

const formatWhatsAppNumber = (phone: string): string => {
  // remove spaces, dashes etc
  let cleaned = phone.replace(/\D/g, "");

  // अगर India number hai (10 digit)
  if (cleaned.length === 10) {
    cleaned = "91" + cleaned;
  }

  return `whatsapp:+${cleaned}`;
};

/*
=========================================================
SEND WHATSAPP MESSAGE
=========================================================
*/

export const sendWhatsAppMessage = async ({
  to,
  message,
}: WhatsAppPayload): Promise<boolean> => {
  try {
    if (!to) {
      console.log("❌ WhatsApp: No phone number provided");
      return false;
    }

    const formattedTo = formatWhatsAppNumber(to);

    const response = await client.messages.create({
      from: `whatsapp:${env.TWILIO_WHATSAPP_NUMBER}`, // e.g. whatsapp:+14155238886
      to: formattedTo,
      body: message,
    });

    console.log("✅ WhatsApp sent:", response.sid);

    return true;
  } catch (error: any) {
    console.error("❌ WhatsApp send error:", error?.message || error);

    return false;
  }
};

/*
=========================================================
ADVANCED: TEMPLATE MESSAGE (OPTIONAL)
=========================================================
*/

export const sendWhatsAppTemplate = async ({
  to,
  templateName,
  variables,
}: {
  to: string;
  templateName: string;
  variables?: string[];
}) => {
  try {
    const formattedTo = formatWhatsAppNumber(to);

    const response = await client.messages.create({
      from: `whatsapp:${env.TWILIO_WHATSAPP_NUMBER}`,
      to: formattedTo,
      contentSid: templateName, // Twilio template SID
      contentVariables: JSON.stringify(variables || []),
    });

    console.log("✅ WhatsApp template sent:", response.sid);

    return true;
  } catch (error: any) {
    console.error("❌ Template send error:", error?.message || error);
    return false;
  }
};