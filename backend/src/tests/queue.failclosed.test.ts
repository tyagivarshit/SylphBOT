import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import redis, {
  __redisRuntimeTestInternals,
  getSharedRedisConnection,
} from "../config/redis";
import { __rateLimitTestInternals } from "../middleware/rateLimit.middleware";
import { createResilientQueue } from "../queues/queue.defaults";
import { consumeBusinessMessageMinuteRate } from "../redis/rateLimiter.redis";
import { writeRedisJsonIfChangedStrict } from "../services/redisState.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

class FakeRedisClient extends EventEmitter {
  status = "wait";
  connectCalls = 0;
  private readonly readyDelaysMs: number[];

  constructor(readyDelaysMs: number[]) {
    super();
    this.readyDelaysMs = [...readyDelaysMs];
  }

  async connect() {
    this.connectCalls += 1;
    const delayMs = this.readyDelaysMs.length ? this.readyDelaysMs.shift()! : 0;
    this.status = "connecting";
    setTimeout(() => {
      this.status = "ready";
      this.emit("ready");
    }, Math.max(0, delayMs));
  }
}

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
  {
    name: "queue failclosed delayed redis ready gate waits deterministically before writable state",
    run: async () => {
      const fake = new FakeRedisClient([80]);
      const startedAt = Date.now();

      await __redisRuntimeTestInternals.waitForClientReady(
        fake as any,
        "delayed-ready",
        800
      );

      const elapsedMs = Date.now() - startedAt;
      assert.ok(elapsedMs >= 60);
      assert.equal(fake.status, "ready");
      assert.ok(fake.connectCalls >= 1);
    },
  },
  {
    name: "queue failclosed redis reconnect gate recovers from end status without rejection",
    run: async () => {
      const fake = new FakeRedisClient([0, 60]);
      await __redisRuntimeTestInternals.waitForClientReady(
        fake as any,
        "reconnect-initial",
        500
      );

      fake.status = "end";
      await __redisRuntimeTestInternals.waitForClientReady(
        fake as any,
        "reconnect-second",
        800
      );

      assert.equal(fake.status, "ready");
      assert.ok(fake.connectCalls >= 2);
    },
  },
  {
    name: "queue failclosed startup race with parallel readiness waiters resolves cleanly",
    run: async () => {
      const fake = new FakeRedisClient([60]);
      await Promise.all([
        __redisRuntimeTestInternals.waitForClientReady(fake as any, "race-a", 800),
        __redisRuntimeTestInternals.waitForClientReady(fake as any, "race-b", 800),
        __redisRuntimeTestInternals.waitForClientReady(fake as any, "race-c", 800),
      ]);

      assert.equal(fake.status, "ready");
      assert.ok(fake.connectCalls >= 1);
    },
  },
  {
    name: "queue failclosed queue cold boot masks raw redis stream errors behind queue_unavailable",
    run: async () => {
      const queue = createResilientQueue(
        {
          add: async () => {
            throw new Error(
              "Stream isn't writeable and enableOfflineQueue options is false"
            );
          },
        } as any,
        "cold-boot-queue"
      );

      await assert.rejects(
        () => (queue as any).add("process", { id: "cold_boot" }),
        /queue_unavailable:cold-boot-queue\.add/
      );
    },
  },
  {
    name: "queue failclosed rate limiter cold boot skips redis store before writable",
    run: () => {
      const shared = getSharedRedisConnection() as any;
      const originalStatus = shared.status;

      try {
        shared.status = "wait";
        assert.equal(__rateLimitTestInternals.shouldSkipRedisRateLimit(), true);
      } finally {
        shared.status = originalStatus;
      }
    },
  },
];
