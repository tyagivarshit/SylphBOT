import assert from "node:assert/strict";
import * as distributedLockService from "../services/distributedLock.service";
import { runAutonomousSchedulerAsLeader } from "../services/autonomous/scheduler.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const buildSchedulerResult = () => ({
  generatedAt: new Date().toISOString(),
  businesses: 0,
  evaluatedLeads: 0,
  queued: 0,
  pending: 0,
  blocked: 0,
  skipped: 0,
  results: [],
});

export const schedulerLeaderTests: TestCase[] = [
  {
    name: "scheduler leader wrapper skips when lease is unavailable",
    run: async () => {
      const originalAcquire = (distributedLockService as any).acquireDistributedLock;

      try {
        (distributedLockService as any).acquireDistributedLock = async () => null;
        const result = await runAutonomousSchedulerAsLeader({
          runner: async () => buildSchedulerResult(),
        });
        assert.equal(result, null);
      } finally {
        (distributedLockService as any).acquireDistributedLock = originalAcquire;
      }
    },
  },
  {
    name: "scheduler leader wrapper prevents same-process overlap and releases cleanly",
    run: async () => {
      const originalAcquire = (distributedLockService as any).acquireDistributedLock;
      let released = 0;
      let executions = 0;

      try {
        (distributedLockService as any).acquireDistributedLock = async () => ({
          key: "autonomous:scheduler:leader",
          token: "token_1",
          ttlMs: 90_000,
          extend: async () => true,
          release: async () => {
            released += 1;
          },
        });

        const runner = async () => {
          executions += 1;
          await new Promise((resolve) => setTimeout(resolve, 50));
          return buildSchedulerResult();
        };

        const [first, second] = await Promise.all([
          runAutonomousSchedulerAsLeader({ runner }),
          runAutonomousSchedulerAsLeader({ runner }),
        ]);

        assert.ok(first);
        assert.equal(second, null);
        assert.equal(executions, 1);
        assert.equal(released, 2);
      } finally {
        (distributedLockService as any).acquireDistributedLock = originalAcquire;
      }
    },
  },
];
