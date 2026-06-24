export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
}

export interface MessageDTO {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionResult {
  content: string;
  model: string;
  latencyMs: number;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface IModelManager {
  generateCompletion(
    messages: MessageDTO[],
    options?: CompletionOptions
  ): Promise<CompletionResult>;
}

export interface EmbeddingResult {
  vector: number[];
  dimensions: number;
  durationMs: number;
  source: "local" | "remote";
}

export interface IEmbeddingEngine {
  getEmbedding(text: string): Promise<EmbeddingResult>;
  getEmbeddingBatch(texts: string[]): Promise<EmbeddingResult[]>;
  warmup(): Promise<void>;
}

export interface RuntimeConfig {
  environment: "development" | "staging" | "production" | "test";
  modelProvider: "groq" | "openai";
  defaultModelName: string;
  embeddingMode: "local" | "remote";
  redisUrl: string;
  maxQueueWaitMs: number;
}

export interface IConfigManager {
  getConfig(): RuntimeConfig;
  get(key: keyof RuntimeConfig): string | number | boolean;
}

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  backoffFactor: number;
  retryableErrorCodes: string[];
}

export interface IRetryManager {
  executeWithRetry<T>(
    task: () => Promise<T>,
    policy?: Partial<RetryPolicy>
  ): Promise<T>;
}

export interface CircuitBreakerConfig {
  failureThresholdPercent: number; // tripped state threshold (default 15%)
  slidingWindowSeconds: number;    // monitoring window size (default 60s)
  halfOpenMaxSuccesses: number;    // required successes to restore connection (default 3)
  recoveryTimeoutSeconds: number;  // cooldown period in tripped state (default 30s)
}
