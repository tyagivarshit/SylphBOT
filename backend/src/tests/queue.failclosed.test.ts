import assert from "node:assert/strict";
import redis, { getSharedRedisConnection } from "../config/redis";
import { consumeBusinessMessageMinuteRate } from "../redis/rateLimiter.redis";
import { writeRedisJsonIfChangedStrict } from "../services/redisState.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

export const queueFailClosedTests: TestCase[] = [
  {
    name: "queue failclosed keeps Redis offline queue disabled",
    run: () => {
      const shared = getSharedRedisConnection() as any;
      assert.equal(shared.options.enableOfflineQueue, false);
    },
  },
  {
    name: "queue failclosed rate limiter denies traffic during Redis outage",
    run: async () => {
      const originalEval = (redis as any).eval;

      try {
        (redis as any).eval = async () => {
          throw new Error("redis_down");
        };

        const window = await consumeBusinessMessageMinuteRate("business_1", 10);
        assert.equal(window.allowed, false);
      } finally {
        (redis as any).eval = originalEval;
      }
    },
  },
  {
    name: "queue failclosed strict checkpoint write throws on Redis failure",
    run: async () => {
      const shared = getSharedRedisConnection() as any;
      const originalGet = shared.get;
      const originalSet = shared.set;

      try {
        shared.get = async () => null;
        shared.set = async () => {
          throw new Error("redis_down");
        };

        await assert.rejects(
          () => writeRedisJsonIfChangedStrict("phase4:test:checkpoint", { ok: true }, 60),
          /redis_down/
        );
      } finally {
        shared.get = originalGet;
        shared.set = originalSet;
      }
    },
  },
];
