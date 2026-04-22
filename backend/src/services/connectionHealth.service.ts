import axios from "axios";
import prisma from "../config/prisma";
import { decrypt } from "../utils/encrypt";

type ConnectionHealthClient = {
  id: string;
  platform: string;
  accessToken: string;
  isActive?: boolean | null;
};

const getMetaAppToken = () => {
  const appId = String(process.env.META_APP_ID || "").trim();
  const appSecret = String(process.env.META_APP_SECRET || "").trim();

  if (!appId || !appSecret) {
    return null;
  }

  return `${appId}|${appSecret}`;
};

const getMetaErrorMessage = (error: any) =>
  error?.response?.data?.error?.message ||
  error?.response?.data?.message ||
  error?.message ||
  "Unknown error";

const isExpiredTimestamp = (value: unknown) => {
  const expiresAt = Number(value || 0);

  return expiresAt > 0 && expiresAt * 1000 <= Date.now();
};

const isMetaAuthFailure = (error: any) => {
  const status = Number(error?.response?.status || 0);
  const code = Number(error?.response?.data?.error?.code || 0);
  const message = getMetaErrorMessage(error).toLowerCase();

  if (code === 190 || status === 401) {
    return true;
  }

  if (
    (status === 400 || status === 403) &&
    /(token|expired|permission|session|invalid|authorization)/i.test(message)
  ) {
    return true;
  }

  return false;
};

const logInactiveConnection = (client: ConnectionHealthClient) => {
  console.warn("Token invalid", {
    clientId: client.id,
    platform: client.platform,
  });
  console.warn("Connection lost", {
    clientId: client.id,
    platform: client.platform,
  });
  console.warn("Connection inactive", {
    clientId: client.id,
    platform: client.platform,
  });
};

const markClientInactive = async (client: ConnectionHealthClient) => {
  if (client.isActive === false) {
    return;
  }

  await prisma.client.update({
    where: { id: client.id },
    data: {
      isActive: false,
    },
  });

  logInactiveConnection(client);
};

const validateWithDebugToken = async (accessToken: string) => {
  const appToken = getMetaAppToken();

  if (!appToken) {
    return null;
  }

  const response = await axios.get(
    "https://graph.facebook.com/v19.0/debug_token",
    {
      params: {
        input_token: accessToken,
        access_token: appToken,
      },
      timeout: 10000,
    }
  );

  const tokenData = response.data?.data;

  if (!tokenData) {
    return null;
  }

  if (!tokenData.is_valid || isExpiredTimestamp(tokenData.expires_at)) {
    return false;
  }

  return true;
};

const validateWithSimpleRequest = async (accessToken: string) => {
  await axios.get("https://graph.facebook.com/v19.0/me", {
    params: {
      fields: "id",
      access_token: accessToken,
    },
    timeout: 10000,
  });

  return true;
};

export async function checkConnectionHealth(client: ConnectionHealthClient) {
  if (!client) {
    return false;
  }

  if (client.isActive === false) {
    return false;
  }

  let accessToken = "";

  try {
    accessToken = decrypt(client.accessToken || "").trim();
  } catch {
    await markClientInactive(client);
    return false;
  }

  if (!accessToken) {
    await markClientInactive(client);
    return false;
  }

  try {
    const debugResult = await validateWithDebugToken(accessToken);

    if (debugResult === true) {
      return true;
    }

    if (debugResult === false) {
      await markClientInactive(client);
      return false;
    }
  } catch {
    // Fall back to a lightweight Graph request if debug_token is unavailable.
  }

  try {
    await validateWithSimpleRequest(accessToken);
    return true;
  } catch (error: any) {
    if (isMetaAuthFailure(error)) {
      await markClientInactive(client);
      return false;
    }

    return true;
  }
}
