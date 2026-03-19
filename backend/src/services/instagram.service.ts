import axios from "axios";
import prisma from "../config/prisma";
import { decrypt } from "../utils/encrypt";

interface Media {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  permalink: string;
}

export const fetchInstagramMedia = async (
  clientId: string
): Promise<Media[]> => {

  const client = await prisma.client.findUnique({
    where: { id: clientId },
  });

  if (!client) {
    throw new Error("Client not found");
  }

  if (!client.accessToken || !client.pageId) {
    throw new Error("Instagram not connected properly");
  }

  const accessToken = decrypt(client.accessToken);

  try {

    const res = await axios.get(
      `https://graph.facebook.com/v19.0/${client.pageId}/media`,
      {
        params: {
          fields:
            "id,caption,media_type,media_url,permalink,timestamp",
          access_token: accessToken,
          limit: 25,
        },
        timeout: 10000,
      }
    );

    const media = res.data?.data || [];

    return media.map((m: any) => ({
      id: m.id,
      caption: m.caption || "",
      media_type: m.media_type,
      media_url: m.media_url,
      permalink: m.permalink,
    }));

  } catch (error: any) {

    console.error("Instagram fetch error:", error.response?.data || error.message);

    throw new Error("Failed to fetch Instagram media");

  }

};