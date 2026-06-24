import assert from "node:assert/strict";
import { DIContainer } from "../runtime/kernel/diContainer";
import {
  ToolRegistry,
  ValidationEngine,
  PermissionEngine,
  PolicyEngine,
  ApprovalEngine,
  CircuitBreakerEngine,
  RetryManager,
  ExecutionTracker,
  ResourceScheduler,
  ToolExecutor,
  ExtendedToolDefinition,
  ExecutionContext
} from "../runtime/execution";

export const runtimeExecutionTests: any[] = [
  {
    name: "Tool Registry: registers, matches capabilities and updates tool health states",
    run: () => {
      const registry = new ToolRegistry();
      
      const tool: ExtendedToolDefinition = {
        name: "test_tool",
        description: "a test capability",
        version: "1.2.0",
        schema: { type: "object", properties: {} },
        execute: async () => "success",
        permissions: ["user"],
        health: "Healthy",
        capabilities: ["math", "calculation"]
      };

      registry.registerTool(tool);

      const fetched = registry.getTool("test_tool");
      assert.ok(fetched);
      assert.equal(fetched.version, "1.2.0");

      const matched = registry.findToolsForCapability("math");
      assert.equal(matched.length, 1);
      assert.equal(matched[0].name, "test_tool");

      registry.updateToolHealth("test_tool", "Degraded");
      assert.equal(registry.getTool("test_tool")?.health, "Degraded");
    }
  },
  {
    name: "Validation Engine: checks schema parameter types and detects sql/xss injection signatures",
    run: () => {
      const validator = new ValidationEngine();

      const schema = {
        type: "object",
        required: ["id", "amount"],
        properties: {
          id: { type: "string" },
          amount: { type: "number" }
        }
      };

      // Valid case
      const check1 = validator.validateInput(schema, { id: "tx_1", amount: 100 });
      assert.equal(check1.isValid, true);

      // Invalid type & missing required
      const check2 = validator.validateInput(schema, { id: 123 });
      assert.equal(check2.isValid, false);
      assert.ok(check2.errors.length >= 2);

      // Safety checks: sql injection
      const sqlCheck = validator.validateSafety({ query: "SELECT * FROM Users; --" });
      assert.equal(sqlCheck.isSafe, false);
      assert.ok(sqlCheck.blockReason?.includes("SQL"));

      // Safety checks: xss injection
      const xssCheck = validator.validateSafety({ text: "<script>alert(1)</script>" });
      assert.equal(xssCheck.isSafe, false);
      assert.ok(xssCheck.blockReason?.includes("XSS"));
    }
  },
  {
    name: "Permission Engine: prevents multi-tenant boundary violation and unauthorized roles",
    run: () => {
      const engine = new PermissionEngine();

      const tool: ExtendedToolDefinition = {
        name: "secure_tool",
        description: "requires admin roles",
        version: "1.0.0",
        schema: {},
        execute: async () => {},
        permissions: ["admin"],
        health: "Healthy",
        capabilities: [],
        ownerTenantId: "tenant_alpha"
      };

      // Valid execution context
      const validCtx: ExecutionContext = {
        tenantId: "tenant_alpha",
        userId: "user_1",
        requestId: "r1",
        roles: ["admin", "user"],
        correlationId: "c1"
      };

      const check1 = engine.authorize(validCtx, tool);
      assert.equal(check1.authorized, true);

      // Invalid roles (no admin)
      const invalidRoleCtx = { ...validCtx, roles: ["user"] };
      const check2 = engine.authorize(invalidRoleCtx, tool);
      assert.equal(check2.authorized, false);
      assert.ok(check2.reason?.includes("lack required permission"));

      // Tenant boundary violation
      const invalidTenantCtx = { ...validCtx, tenantId: "tenant_beta" };
      const check3 = engine.authorize(invalidTenantCtx, tool);
      assert.equal(check3.authorized, false);
      assert.ok(check3.reason?.includes("Tenant Boundary Violation"));
    }
  },
  {
    name: "Policy Engine: evaluates compliance limits and generates escalation signals",
    run: () => {
      const engine = new PolicyEngine();

      const context: ExecutionContext = {
        tenantId: "t1",
        userId: "u1",
        requestId: "r1",
        roles: [],
        correlationId: "c1"
      };

      // Payload exceeds size limit check
      const largePayload = "a".repeat(100001);
      const check1 = engine.evaluate(context, { data: largePayload });
      assert.equal(check1.allowed, false);
      assert.equal(check1.escalationRequired, true);

      // Register custom compliance policy rule: Limit transaction value to $1000
      engine.registerRule({
        id: "max_value_limit",
        name: "Check transaction limits",
        evaluator: (ctx, input) => {
          if (input && typeof input.val === "number" && input.val > 1000) {
            return { allowed: false, escalationRequired: false, reason: "Value exceeds limit." };
          }
          return { allowed: true, escalationRequired: false };
        }
      });

      const check2 = engine.evaluate(context, { val: 500 });
      assert.equal(check2.allowed, true);

      const check3 = engine.evaluate(context, { val: 2000 });
      assert.equal(check3.allowed, false);
      assert.ok(check3.reasons[0].includes("Value exceeds limit"));
    }
  },
  {
    name: "Approval Engine: evaluates multi-step approval stages and processes audit trails",
    run: () => {
      const engine = new ApprovalEngine();

      // Create step approval
      const request = engine.createRequest("t1", "exec_1", "requester_1", 2, { amount: 500 });
      assert.equal(request.status, "pending");
      assert.equal(request.stepsCompleted, 0);

      // Verify approval state
      assert.equal(engine.isApproved(request.id), false);

      // Approve step 1
      engine.approve(request.id, "approver_1");
      const step1 = engine.getRequest(request.id);
      assert.equal(step1?.stepsCompleted, 1);
      assert.equal(step1?.status, "pending");

      // Approve step 2 (completes check)
      engine.approve(request.id, "approver_2");
      const step2 = engine.getRequest(request.id);
      assert.equal(step2?.status, "approved");
      assert.equal(engine.isApproved(request.id), true);
      assert.ok(step2?.auditTrail.some(t => t.includes("Request fully approved")));

      // Test rejection flow
      const req2 = engine.createRequest("t1", "exec_2", "requester_1");
      engine.reject(req2.id, "approver_9");
      assert.equal(engine.getRequest(req2.id)?.status, "rejected");
    }
  },
  {
    name: "Circuit Breaker: monitors tool failures and opens state to block cascading errors",
    run: () => {
      const breaker = new CircuitBreakerEngine({
        failureThreshold: 2,
        cooldownPeriodMs: 10,
        halfOpenSuccessLimit: 1
      });

      assert.equal(breaker.canExecute("calc"), true);

      // Record first failure (still closed)
      breaker.recordFailure("calc");
      assert.equal(breaker.getState("calc"), "CLOSED");
      assert.equal(breaker.canExecute("calc"), true);

      // Record second failure (reaches threshold, trips OPEN)
      breaker.recordFailure("calc");
      assert.equal(breaker.getState("calc"), "OPEN");
      assert.equal(breaker.canExecute("calc"), false);

      // Wait for recovery window to elapse
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // Verify that check auto-transitions state to HALF_OPEN
          assert.equal(breaker.canExecute("calc"), true);
          assert.equal(breaker.getState("calc"), "HALF_OPEN");

          // Test half open failure resets directly to OPEN
          breaker.recordFailure("calc");
          assert.equal(breaker.getState("calc"), "OPEN");

          // Transition to HALF_OPEN again
          setTimeout(() => {
            assert.equal(breaker.canExecute("calc"), true);
            // Record successes to close circuit
            breaker.recordSuccess("calc");
            assert.equal(breaker.getState("calc"), "CLOSED");
            resolve();
          }, 12);
        }, 12);
      });
    }
  },
  {
    name: "Retry Manager: executes retries using exponential delays and escalates on threshold",
    run: async () => {
      const manager = new RetryManager({
        maxAttempts: 3,
        initialDelayMs: 2,
        factor: 2
      });

      let attempts = 0;
      
      // Valid run
      const result = await manager.executeWithRetry(async (attempt) => {
        attempts = attempt;
        return "ok";
      });
      assert.equal(result, "ok");
      assert.equal(attempts, 1);

      // Failing retries run
      let failureCount = 0;
      await assert.rejects(async () => {
        await manager.executeWithRetry(async (attempt) => {
          failureCount = attempt;
          throw new Error("persistent error");
        });
      }, /persistent error/);

      assert.equal(failureCount, 3); // 3 attempts made
    }
  },
  {
    name: "Resource Scheduler: schedules priority queues and respects tenant fairness",
    run: async () => {
      const scheduler = new ResourceScheduler(10, 1); // max active slots per tenant is 1

      const runs: string[] = [];

      // Enqueue tenant 1 low priority task
      const p1 = scheduler.enqueue("tenant_1", "low", async () => {
        runs.push("t1_low");
        return "t1";
      });

      // Enqueue tenant 1 high priority task (blocked because max active slot count per tenant is 1)
      const p2 = scheduler.enqueue("tenant_1", "high", async () => {
        runs.push("t1_high");
        return "t1_high";
      });

      // Enqueue tenant 2 high priority task (executes immediately because concurrency limit allows it and no resource contention)
      const p3 = scheduler.enqueue("tenant_2", "high", async () => {
        runs.push("t2_high");
        return "t2";
      });

      await Promise.all([p1, p2, p3]);

      // Verify that t2_high and t1_low ran before t1_high due to tenant fairness limits
      assert.equal(runs[0], "t1_low");
      assert.equal(runs[1], "t2_high");
      assert.equal(runs[2], "t1_high");
    }
  },
  {
    name: "Tool Executor: orchestrates complete validated tool invocation pipelines",
    run: async () => {
      const container = new DIContainer();
      const registry = new ToolRegistry();
      const tracker = new ExecutionTracker();

      const executor = new ToolExecutor(
        container,
        registry,
        new ValidationEngine(),
        new PermissionEngine(),
        new PolicyEngine(),
        new ApprovalEngine(),
        tracker,
        new CircuitBreakerEngine(),
        new RetryManager({ maxAttempts: 2, initialDelayMs: 1, factor: 1 }),
        new ResourceScheduler()
      );

      // Register test tool
      registry.registerTool({
        name: "sum",
        description: "adds numbers",
        schema: {
          type: "object",
          required: ["a", "b"],
          properties: {
            a: { type: "number" },
            b: { type: "number" }
          }
        },
        execute: async (context, args) => args.a + args.b
      });

      // Valid run pipeline test
      const result = await executor.executeTool("sum", { a: 10, b: 20 }, { tenantId: "t1" });
      assert.equal(result.success, true);
      assert.equal(result.output, 30);

      // Verify tracker state
      const records = (tracker as any).records;
      assert.equal(records.size, 1);
      const firstRecord = Array.from(records.values())[0] as any;
      assert.equal(firstRecord.status, "completed");

      // Invalid validation run
      const failVal = await executor.executeTool("sum", { a: "10" }, { tenantId: "t1" });
      assert.equal(failVal.success, false);
      assert.ok(failVal.error?.includes("Schema Validation Failed"));

      // Batch execution test
      const batchResult = await executor.executeBatch([
        { name: "sum", args: { a: 1, b: 2 } },
        { name: "sum", args: { a: 5, b: 5 } }
      ], { tenantId: "t1" });

      assert.equal(batchResult.length, 2);
      assert.equal(batchResult[0].output, 3);
      assert.equal(batchResult[1].output, 10);
    }
  }
];
