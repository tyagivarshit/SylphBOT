import redis from "../../config/redis";
import crypto from "crypto";

export interface LockConfig {
  ttlMs?: number;       // default 20000 ms
  retryDelayMs?: number; // default 150 ms
  maxRetries?: number;   // default 60 (total wait ~9 seconds)
}

export class RedisLock {
  private key: string;
  private token: string;
  private ttlMs: number;
  private retryDelayMs: number;
  private maxRetries: number;

  constructor(key: string, config?: LockConfig) {
    this.key = `lock:${key}`;
    this.token = crypto.randomUUID();
    this.ttlMs = config?.ttlMs ?? 20000;
    this.retryDelayMs = config?.retryDelayMs ?? 150;
    this.maxRetries = config?.maxRetries ?? 60;
  }

  async acquire(): Promise<boolean> {
    let attempts = 0;
    while (attempts < this.maxRetries) {
      // Set key with PX (milliseconds TTL) and NX (only if not exists)
      const result = await redis.set(this.key, this.token, "PX", this.ttlMs, "NX");
      if (result === "OK") {
        return true;
      }
      attempts++;
      // Jitter retry delay slightly
      const delay = this.retryDelayMs + Math.floor(Math.random() * 30);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return false;
  }

  async release(): Promise<boolean> {
    // Lua script to safely release lock only if the token matches
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await redis.eval(script, 1, this.key, this.token);
    return result === 1;
  }
}

export const withDistributedLock = async <T>(
  key: string,
  operation: () => Promise<T>,
  config?: LockConfig
): Promise<T> => {
  const lock = new RedisLock(key, config);
  const acquired = await lock.acquire();
  if (!acquired) {
    throw new Error("lock_acquisition_timeout");
  }
  try {
    return await operation();
  } finally {
    await lock.release().catch(() => undefined);
  }
};
