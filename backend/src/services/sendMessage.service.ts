import axios from "axios";

export const sendInstagramMessage = async ({
  recipientId,
  message,
  accessToken,
}: {
  recipientId: string;
  message: string;
  accessToken: string;
}) => {

  await axios.post(
    `https://graph.facebook.com/v18.0/me/messages`,
    {
      recipient: { id: recipientId },
      message: { text: message },
    },
    {
      params: { access_token: accessToken },
    }
  );
};

export const sendWhatsAppMessage = async ({
  phoneNumberId,
  to,
  message,
  accessToken,
}: {
  phoneNumberId: string;
  to: string;
  message: string;
  accessToken: string;
}) => {

  await axios.post(
    `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
};