import { IConfigManager, RuntimeConfig } from "../interfaces/core";
import { env } from "../../config/env";

export class ConfigManager implements IConfigManager {
  private config: RuntimeConfig;
  private extraSettings: Record<string, any>;

  constructor() {
    this.loadAndValidate();
  }

  private loadAndValidate(): void {
    const nodeEnv = (env.NODE_ENV || process.env.NODE_ENV || "development") as RuntimeConfig["environment"];
    const modelProvider = (process.env.AI_MODEL_PROVIDER || "openai") as RuntimeConfig["modelProvider"];
    const defaultModelName = process.env.AI_DEFAULT_MODEL_NAME || "gpt-4o";
    const embeddingMode = (process.env.AI_EMBEDDING_MODE || "remote") as RuntimeConfig["embeddingMode"];
    const redisUrl = env.REDIS_URL || process.env.REDIS_URL || "redis://127.0.0.1:6379";
    const maxQueueWaitMs = Number(process.env.AI_MAX_QUEUE_WAIT_MS) || 30000;
    
    this.config = {
      environment: nodeEnv,
      modelProvider,
      defaultModelName,
      embeddingMode,
      redisUrl,
      maxQueueWaitMs,
    };

    this.extraSettings = {
      version: process.env.RUNTIME_VERSION || "1.0.0",
      buildNumber: process.env.RUNTIME_BUILD_NUMBER || "local-dev",
      timeouts: {
        modelCompletion: Number(process.env.TIMEOUT_MODEL_COMPLETION_MS) || 12000,
        embeddingCompute: Number(process.env.TIMEOUT_EMBEDDING_COMPUTE_MS) || 8000,
        toolExecution: Number(process.env.TIMEOUT_TOOL_EXECUTION_MS) || 5000,
        eventBusPublish: Number(process.env.TIMEOUT_EVENT_BUS_PUBLISH_MS) || 1000,
        schedulerJob: Number(process.env.TIMEOUT_SCHEDULER_JOB_MS) || 2000,
      },
      retry: {
        maxAttempts: Number(process.env.RETRY_MAX_ATTEMPTS) || 3,
        initialDelayMs: Number(process.env.RETRY_INITIAL_DELAY_MS) || 1000,
        backoffFactor: Number(process.env.RETRY_BACKOFF_FACTOR) || 2,
      },
      limits: {
        maxTokens: Number(process.env.LIMIT_MAX_TOKENS) || 4096,
        maxBatchSize: Number(env.AI_API_MAX_BATCH_SIZE) || 250,
      },
      featureFlags: {
        shadowModeEnabled: process.env.FF_SHADOW_MODE_ENABLED === "true",
        dynamicRoutingEnabled: process.env.FF_DYNAMIC_ROUTING_ENABLED === "true",
        circuitBreakerEnabled: process.env.FF_CIRCUIT_BREAKER_ENABLED !== "false",
        learningRegistryEnabled: process.env.FF_LEARNING_REGISTRY_ENABLED === "true",
      }
    };

    this.validate();
  }

  private validate(): void {
    if (!["development", "staging", "production", "test"].includes(this.config.environment)) {
      throw new Error(`CFG_INVALID_VALUE: Invalid environment variable NODE_ENV = '${this.config.environment}'`);
    }
    if (!["groq", "openai"].includes(this.config.modelProvider)) {
      throw new Error(`CFG_INVALID_VALUE: Unsupported model provider '${this.config.modelProvider}'`);
    }
    if (!["local", "remote"].includes(this.config.embeddingMode)) {
      throw new Error(`CFG_INVALID_VALUE: Unsupported embedding mode '${this.config.embeddingMode}'`);
    }
    if (!this.config.redisUrl.startsWith("redis://") && !this.config.redisUrl.startsWith("rediss://")) {
      throw new Error(`CFG_INVALID_VALUE: Redis URL must start with redis:// or rediss://`);
    }
  }

  public getConfig(): RuntimeConfig {
    return this.config;
  }

  public get(key: keyof RuntimeConfig): string | number | boolean {
    const value = this.config[key];
    if (value === undefined) {
      throw new Error(`CFG_MISSING_KEY: Key [${key}] does not exist in configuration.`);
    }
    return value;
  }

  public getExtraSetting<T = any>(path: string, defaultValue?: T): T {
    const parts = path.split(".");
    let current: any = this.extraSettings;

    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== "object") {
        return defaultValue as T;
      }
      current = current[part];
    }

    return (current !== undefined ? current : defaultValue) as T;
  }
}
