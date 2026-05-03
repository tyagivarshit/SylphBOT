import { apiClient } from "@/lib/apiClient";
import { apiFetch } from "@/lib/apiClient";

export type AutomationStepConfig = {
  message?: string | null;
  condition?: string | null;
  delay?: number;
  replyMode?: "AI" | "TEMPLATE";
  aiPrompt?: string | null;
};

export type AutomationFlowStep = {
  stepKey?: string;
  stepType?: string;
  message?: string | null;
  condition?: string | null;
  nextStep?: string | null;
  metadata?: AutomationStepConfig | null;
};

export type AutomationFlow = {
  id: string;
  name?: string | null;
  channel?: string | null;
  triggerType?: string | null;
  triggerValue?: string | null;
  status?: string | null;
  steps?: AutomationFlowStep[];
};

export type CreateAutomationFlowInput = {
  name: string;
  triggerValue: string;
  triggerType?: string;
  channel?: string;
  steps: Array<{
    type: string;
    config: AutomationStepConfig;
  }>;
};

export type CommentTrigger = {
  id: string;
  clientId?: string | null;
  reelId?: string | null;
  keyword?: string | null;
  replyText?: string | null;
  dmText?: string | null;
  aiPrompt?: string | null;
  isActive?: boolean;
  triggerCount?: number;
};

export type CreateCommentTriggerInput = {
  clientId: string;
  reelId: string;
  keyword: string;
  replyText: string;
  dmText?: string;
  aiPrompt?: string;
};

export async function getAutomationFlows(): Promise<AutomationFlow[]> {
  const response = await apiFetch<AutomationFlow[]>("/api/automation/flows", {
    cache: "no-store",
    timeoutMs: 1800,
  });

  if (response.limited || response.upgradeRequired) {
    return [];
  }

  if (!response.success) {
    if ((response.message || "").toLowerCase().includes("timeout")) {
      return [];
    }
    throw new Error(response.message || "Failed to fetch automations");
  }

  return Array.isArray(response.data) ? response.data : [];
}

export async function createAutomationFlow(payload: CreateAutomationFlowInput) {
  const response = await apiClient.post<{
    success?: boolean;
    flow?: AutomationFlow;
    message?: string;
  }>("/automation/flows", payload);

  return response.data;
}

export async function updateAutomationFlow(
  id: string,
  payload: CreateAutomationFlowInput & { status?: string }
) {
  const response = await apiClient.patch<{
    success?: boolean;
    flow?: AutomationFlow;
    message?: string;
  }>(`/automation/flows/${id}`, payload);

  return response.data;
}

export async function deleteAutomationFlow(id: string) {
  const response = await apiClient.delete<{
    success?: boolean;
    id?: string;
    message?: string;
  }>(`/automation/flows/${id}`);

  return response.data;
}

export async function getCommentTriggers(): Promise<CommentTrigger[]> {
  const response = await apiClient.get<CommentTrigger[] | { triggers?: CommentTrigger[] }>(
    "/comment-triggers"
  );

  return Array.isArray(response.data)
    ? response.data
    : response.data?.triggers || [];
}

export async function createCommentTrigger(payload: CreateCommentTriggerInput) {
  const response = await apiClient.post<{
    success?: boolean;
    trigger?: CommentTrigger;
    message?: string;
  }>("/comment-triggers", payload);

  return response.data;
}
