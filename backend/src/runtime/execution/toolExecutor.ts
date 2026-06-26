import { IToolExecutor, ToolExecutionResult } from "../interfaces/execution";
import { ToolRegistry } from "./toolRegistry";
import { ValidationEngine } from "./validationEngine";
import { PermissionEngine } from "./permissionEngine";
import { PolicyEngine } from "./policyEngine";
import { ApprovalEngine } from "./approvalEngine";
import { ExecutionTracker } from "./executionTracker";
import { CircuitBreakerEngine } from "./circuitBreaker";
import { RetryManager } from "./retryManager";
import { ResourceScheduler } from "./resourceScheduler";
import { ExecutionContext } from "./types";
import { DIContainer, container } from "../kernel/diContainer";
import { RuntimeGuard } from "../kernel/runtimeGuard";

export class ToolExecutor implements IToolExecutor {
  private diContainer: DIContainer;
  private registry: ToolRegistry;
  private validator: ValidationEngine;
  private permissionEngine: PermissionEngine;
  private policyEngine: PolicyEngine;
  private approvalEngine: ApprovalEngine;
  private tracker: ExecutionTracker;
  private circuitBreaker: CircuitBreakerEngine;
  private retryManager: RetryManager;
  private scheduler: ResourceScheduler;

  constructor(
    diContainer: DIContainer = container,
    registry = new ToolRegistry(),
    validator = new ValidationEngine(),
    permissionEngine = new PermissionEngine(),
    policyEngine = new PolicyEngine(),
    approvalEngine = new ApprovalEngine(),
    tracker = new ExecutionTracker(),
    circuitBreaker = new CircuitBreakerEngine(),
    retryManager = new RetryManager(),
    scheduler = new ResourceScheduler()
  ) {
    this.diContainer = diContainer;
    this.registry = registry;
    this.validator = validator;
    this.permissionEngine = permissionEngine;
    this.policyEngine = policyEngine;
    this.approvalEngine = approvalEngine;
    this.tracker = tracker;
    this.circuitBreaker = circuitBreaker;
    this.retryManager = retryManager;
    this.scheduler = scheduler;
  }

  /**
   * Orchestrates the complete execution pipeline for a tool invocation.
   */
  public async executeTool(
    name: string,
    args: Record<string, unknown>,
    context: any
  ): Promise<ToolExecutionResult> {
    RuntimeGuard.enforceToolExecution(name);
    const correlationId = context?.correlationId || context?.requestId || `corr_${Date.now()}`;
    const tenantId = context?.tenantId || context?.businessId || "default_tenant";
    
    // 1. Resolve Execution Context
    const execContext: ExecutionContext = {
      tenantId,
      userId: context?.userId || context?.agentId || "system",
      requestId: context?.requestId || `req_${Date.now()}`,
      roles: context?.roles || context?.userRoles || ["user"],
      correlationId
    };

    // 2. Fetch tool details from Registry
    const tool = this.registry.getTool(name);
    if (!tool) {
      return {
        toolName: name,
        success: false,
        error: `Tool [${name}] not found in tool registry.`
      };
    }

    // 3. Evaluate Circuit Breaker State
    if (!this.circuitBreaker.canExecute(name)) {
      return {
        toolName: name,
        success: false,
        error: `Execution blocked: Circuit breaker is tripped (OPEN) for tool [${name}].`
      };
    }

    // 4. Run Input Validation
    const safetyCheck = this.validator.validateSafety(args);
    if (!safetyCheck.isSafe) {
      return {
        toolName: name,
        success: false,
        error: `Validation Safety Block: ${safetyCheck.blockReason}`
      };
    }

    const inputCheck = this.validator.validateInput(tool.schema, args);
    if (!inputCheck.isValid) {
      return {
        toolName: name,
        success: false,
        error: `Schema Validation Failed: ${inputCheck.errors.join("; ")}`
      };
    }

    // 5. Verify Permissions
    const authCheck = this.permissionEngine.authorize(execContext, tool);
    if (!authCheck.authorized) {
      return {
        toolName: name,
        success: false,
        error: authCheck.reason || "Unauthorized tool access."
      };
    }

    // 6. Audit Policies & Escalation points
    const policyCheck = this.policyEngine.evaluate(execContext, args);
    if (!policyCheck.allowed) {
      return {
        toolName: name,
        success: false,
        error: `Policy Constraint Violation: ${policyCheck.reasons.join("; ")}`
      };
    }

    // 7. Manual/Multi-Step Approval Verification
    const approvalId = args?.approvalId as string | undefined;
    if (approvalId) {
      const request = this.approvalEngine.getRequest(approvalId);
      if (!request) {
        return {
          toolName: name,
          success: false,
          error: `Approval Request [${approvalId}] was not found.`
        };
      }
      if (request.status !== "approved") {
        return {
          toolName: name,
          success: false,
          error: `Execution Blocked: Approval request [${approvalId}] has status [${request.status}].`
        };
      }
    }

    // Determine execution priority level
    const priority: "high" | "medium" | "low" = (args?.priority as any) || "medium";

    // 8. Queue inside Priority Resource Scheduler
    return this.scheduler.enqueue(tenantId, priority, async () => {
      // 9. Start Tracking Audit Log
      const execId = this.tracker.startExecution(correlationId, tenantId, name, args);

      try {
        // 10. Execute Task with Retry Policy Integration
        const result = await this.retryManager.executeWithRetry(
          async (attempt) => {
            if (attempt > 1) {
              this.tracker.recordRetry(execId);
            }

            // Execute the underlying functional callback
            return await tool.execute(context, args);
          },
          { maxAttempts: 3, initialDelayMs: 50, factor: 2 },
          (attempt, err, delay) => {
            // Record failure on circuit breaker per retry attempt
            this.circuitBreaker.recordFailure(name);
          }
        );

        // Record success metrics
        this.circuitBreaker.recordSuccess(name);
        this.tracker.completeExecution(execId, result);

        return {
          toolName: name,
          success: true,
          output: result
        };
      } catch (err: any) {
        const errorMsg = err?.message || String(err);
        this.circuitBreaker.recordFailure(name);
        this.tracker.failExecution(execId, errorMsg);

        return {
          toolName: name,
          success: false,
          error: `Tool Execution Exception: ${errorMsg}`
        };
      }
    });
  }

  /**
   * Batch invocation helper executing lists of tools concurrently.
   */
  public async executeBatch(
    tools: Array<{ name: string; args: Record<string, unknown> }>,
    context: any
  ): Promise<ToolExecutionResult[]> {
    const promises = tools.map(t => this.executeTool(t.name, t.args, context));
    return Promise.all(promises);
  }

  /**
   * Compatibility layer for execute(actor, name, args).
   */
  public async execute(
    actor: any,
    name: string,
    args: Record<string, unknown>
  ): Promise<any> {
    const context = {
      actor,
      tenantId: actor?.tenantId,
      roles: actor?.roles || (actor?.role ? [actor.role] : []),
      userId: actor?.actorId
    };
    const result = await this.executeTool(name, args, context);
    if (!result.success) {
      throw new Error(result.error || `Execution failed for tool [${name}].`);
    }
    return result.output;
  }
}
