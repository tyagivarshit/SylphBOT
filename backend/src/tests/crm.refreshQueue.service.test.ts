import assert from "node:assert/strict";
import { test } from "node:test";
import { createDebouncedRefreshQueue } from "../services/crm/refreshQueue.service";

test("refresh queue coalesces duplicate refresh bursts", async () => {
  let executions = 0;
  const queue = createDebouncedRefreshQueue<
    { key: string; payload: string },
    { key: string; payload: string; executions: number }
  >({
    keyOf: (input) => input.key,
    merge: (_current, next) => next,
    execute: async (input) => {
      executions += 1;
      return {
        ...input,
        executions,
      };
    },
    debounceMs: 20,
    ttlMs: 200,
  });

  const results = await Promise.all([
    queue.request({ key: "lead_1", payload: "first" }, { force: true }),
    queue.request({ key: "lead_1", payload: "second" }, { force: true }),
    queue.request({ key: "lead_1", payload: "third" }, { force: true }),
  ]);

  assert.equal(executions, 1);
  assert.equal(results[0].payload, "third");

  const cached = await queue.request({ key: "lead_1", payload: "ignored" });

  assert.equal(executions, 1);
  assert.equal(cached.executions, 1);
  queue.reset();
});
