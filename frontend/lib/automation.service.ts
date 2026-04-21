import { apiClient } from "@/lib/apiClient";

export type AutomationStepConfig = {
  message?: string;
  condition?: string;
  delay?: number;
  replyMode?: "AI" | "TEMPLATE";
  aiPrompt?: string;
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
  const response = await apiClient.get<AutomationFlow[]>("/automation/flows");
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
