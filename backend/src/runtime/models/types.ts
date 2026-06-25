import { CompletionOptions, MessageDTO, CompletionResult } from "../interfaces/core";

export interface ModelMetadata {
  id: string;
  name: string;
  provider: string;
  contextLimit: number;
  inputCostPer1k: number;  // Cost in USD per 1000 input tokens
  outputCostPer1k: number; // Cost in USD per 1000 output tokens
  capabilities: Array<"chat" | "completion" | "embedding" | "classification" | "vision">;
  version: string;
}

export interface ProviderConfig {
  id: string;
  apiKey?: string;
  baseUrl?: string;
  health: "Healthy" | "Degraded" | "Failed";
  status: "active" | "inactive";
  metadata?: Record<string, any>;
}

export interface ProviderAdapter {
  generateCompletion(
    modelId: string,
    messages: MessageDTO[],
    options?: CompletionOptions
  ): Promise<CompletionResult>;
  
  getEmbedding(
    modelId: string,
    text: string
  ): Promise<number[]>;
}

export interface ModelHealthStats {
  latencySumMs: number;
  samples: number;
  failures: number;
  successes: number;
  lastFailureAt?: Date;
}

export interface RouterConfig {
  defaultCompletionModel: string;
  defaultEmbeddingModel: string;
  defaultClassificationModel: string;
}
