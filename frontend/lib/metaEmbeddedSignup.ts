"use client";

export type MetaEmbeddedSignupConfig = {
  appId: string;
  configId: string;
  graphVersion?: string;
  responseType?: "code";
  overrideDefaultResponseType?: boolean;
  extras?: Record<string, unknown>;
};

export type MetaEmbeddedSignupSession = {
  event?: string | null;
  data?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type MetaStartResponse = {
  state?: string;
  embeddedSignup?: MetaEmbeddedSignupConfig | null;
};

declare global {
  interface Window {
    FB?: {
      init: (options: Record<string, unknown>) => void;
      login: (
        callback: (response: {
          authResponse?: { code?: string | null } | null;
          status?: string;
        }) => void,
        options?: Record<string, unknown>
      ) => void;
    };
  }
}

const readString = (value: unknown) => String(value || "").trim();

const parseMessageData = (value: unknown) => {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
};

const isMetaMessageOrigin = (origin: string) => {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "facebook.com" || host.endsWith(".facebook.com");
  } catch {
    return false;
  }
};

export const isWhatsAppEmbeddedSignupCompleted = (
  session?: MetaEmbeddedSignupSession | null
) => {
  const root = session || {};
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : {};
  const event = readString(root.event || data.event).toUpperCase();
  const phoneNumberId = readString(
    data.phone_number_id ||
      data.phoneNumberId ||
      root.phone_number_id ||
      root.phoneNumberId
  );
  const wabaId = readString(
    data.waba_id || data.wabaId || root.waba_id || root.wabaId
  );

  return (
    (event === "FINISH" ||
      event === "FINISHED" ||
      event === "COMPLETED" ||
      event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") &&
    Boolean(phoneNumberId || wabaId)
  );
};

export const waitForFacebookSdk = async () => {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    if (typeof window !== "undefined" && window.FB) {
      return window.FB;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return null;
};

export const launchWhatsAppEmbeddedSignupSession = async (
  start: MetaStartResponse
) => {
  const embeddedSignup = start.embeddedSignup;
  if (!embeddedSignup?.appId || !embeddedSignup.configId || !start.state) {
    throw new Error("Meta Embedded Signup is not configured for WhatsApp.");
  }

  const facebookSdk = await waitForFacebookSdk();
  if (!facebookSdk) {
    throw new Error("Meta SDK is still loading. Try again in a moment.");
  }

  facebookSdk.init({
    appId: embeddedSignup.appId,
    autoLogAppEvents: true,
    xfbml: false,
    version: embeddedSignup.graphVersion || "v19.0",
  });

  let capturedSession: MetaEmbeddedSignupSession | null = null;
  const messageHandler = (event: MessageEvent) => {
    if (!isMetaMessageOrigin(event.origin)) {
      return;
    }

    const payload = parseMessageData(event.data);
    if (!payload) {
      return;
    }

    const eventName = readString(payload.event).toUpperCase();
    const data =
      payload.data && typeof payload.data === "object"
        ? (payload.data as Record<string, unknown>)
        : {};
    const hasWhatsAppIdentifiers = Boolean(
      readString(data.phone_number_id || data.phoneNumberId) ||
        readString(data.waba_id || data.wabaId)
    );

    if (
      eventName === "FINISH" ||
      eventName === "FINISHED" ||
      eventName === "COMPLETED" ||
      eventName === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" ||
      eventName === "CANCEL" ||
      eventName === "ERROR" ||
      hasWhatsAppIdentifiers
    ) {
      capturedSession = payload as MetaEmbeddedSignupSession;
    }
  };

  window.addEventListener("message", messageHandler);

  try {
    const loginResponse = await new Promise<{
      authResponse?: { code?: string | null } | null;
      status?: string;
    }>((resolve) => {
      facebookSdk.login(resolve, {
        config_id: embeddedSignup.configId,
        response_type: embeddedSignup.responseType || "code",
        override_default_response_type:
          embeddedSignup.overrideDefaultResponseType ?? true,
        extras:
          embeddedSignup.extras || {
            setup: {
              feature: "whatsapp_embedded_signup",
              sessionInfoVersion: "3",
              featureType: "whatsapp_business_app_onboarding",
            },
          },
      });
    });

    const code = readString(loginResponse.authResponse?.code);
    if (!code) {
      throw new Error("Meta Embedded Signup did not return an authorization code.");
    }

    if (!isWhatsAppEmbeddedSignupCompleted(capturedSession)) {
      await new Promise((resolve) => setTimeout(resolve, 1_200));
    }

    if (!isWhatsAppEmbeddedSignupCompleted(capturedSession)) {
      throw new Error(
        "Meta Embedded Signup is not finished yet. Continue the Meta phone and OTP setup."
      );
    }

    return {
      code,
      session: capturedSession,
    };
  } finally {
    window.removeEventListener("message", messageHandler);
  }
};
