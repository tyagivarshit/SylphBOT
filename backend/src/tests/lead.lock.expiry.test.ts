import assert from "node:assert/strict";
import { getSharedRedisConnection } from "../config/redis";
import { acquireDistributedLock } from "../services/distributedLock.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

export const leadLockExpiryTests: TestCase[] = [
  {
    name: "lead lock bounded wait returns without hanging when Redis set stalls",
    run: async () => {
      const shared = getSharedRedisConnection() as any;
      const originalSet = shared.set;
      const startedAt = Date.now();

      try {
        shared.set = async () => new Promise<string>(() => undefined);

        const result = await acquireDistributedLock({
          key: "phase4:lock:timeout",
          ttlMs: 1_000,
          waitMs: 80,
          pollMs: 20,
        });

        const elapsedMs = Date.now() - startedAt;
        assert.equal(result, null);
        assert.ok(elapsedMs < 400);
      } finally {
        shared.set = originalSet;
      }
    },
  },
  {
    name: "lead lock retries until stale holder clears and then acquires atomically",
    run: async () => {
      const shared = getSharedRedisConnection() as any;
      const originalSet = shared.set;
      const originalEval = shared.eval;
      let attempts = 0;

      try {
        shared.set = async () => {
          attempts += 1;
          return attempts >= 3 ? "OK" : null;
        };
        shared.eval = async () => 1;

        const handle = await acquireDistributedLock({
          key: "phase4:lock:stale-recovery",
          ttlMs: 1_000,
          waitMs: 200,
          pollMs: 20,
        });

        assert.ok(handle);
        await handle?.release();
        assert.ok(attempts >= 3);
      } finally {
        shared.set = originalSet;
        shared.eval = originalEval;
      }
    },
  },
];
