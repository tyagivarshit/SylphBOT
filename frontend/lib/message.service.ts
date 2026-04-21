import { apiClient, getApiErrorData, getApiErrorMessage, getApiErrorStatus } from "@/lib/apiClient";

export type MessageSender = "USER" | "AI" | "AGENT";

export type SendConversationMessageInput = {
  content: string;
  sender: MessageSender;
  clientMessageId?: string | null;
};

export type DeliveryResult = {
  delivered?: boolean;
  platform?: string | null;
  reason?: string | null;
  error?: string | null;
};

export type SendConversationMessageResponse = {
  success?: boolean;
  message?: unknown;
  delivery?: DeliveryResult | null;
};

export type PreviewAIReplyInput = {
  leadId: string;
  message: string;
  clientId?: string;
};

export type PreviewAIReplyResponse = {
  success?: boolean;
  aiReply?: string | null;
  message?: string;
  payload?: unknown;
  leadId?: string | null;
};

export type ServiceResponse<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  message?: string;
};

async function requestWithStatus<T>(
  config: Parameters<typeof apiClient.request<T>>[0]
): Promise<ServiceResponse<T>> {
  try {
    const response = await apiClient.request<T>(config);

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      data: response.data,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      status: getApiErrorStatus(error) ?? 0,
      data: getApiErrorData<T>(error),
      message: getApiErrorMessage(error),
    };
  }
}

export function previewAIReply(payload: PreviewAIReplyInput) {
  return requestWithStatus<PreviewAIReplyResponse>({
    url: "/ai/test",
    method: "POST",
    data: payload,
  });
}

export function sendConversationMessage(
  leadId: string,
  payload: SendConversationMessageInput
) {
  return requestWithStatus<SendConversationMessageResponse>({
    url: `/conversations/${leadId}/messages`,
    method: "POST",
    data: payload,
  });
}

export async function startBookingForLead(leadId: string) {
  const response = await apiClient.post("/booking/start", {
    leadId,
  });

  return response.data;
}
