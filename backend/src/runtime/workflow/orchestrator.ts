import { IWorkflowOrchestrator, IWorkflowRegistry, IWorkflowMemory, IWorkflowObservability, WorkflowInstance, WorkflowState, WorkflowStep } from "../interfaces/workflow";
import { DIContainer } from "../kernel/diContainer";

export class WorkflowOrchestrator implements IWorkflowOrchestrator {
  private diContainer: DIContainer;
  private registry: IWorkflowRegistry;
  private memory: IWorkflowMemory;
  private observability: IWorkflowObservability;

  // Resolved execution engines
  private toolExecutor: any;
  private toolRegistry: any;
  private validationEngine: any;
  private permissionEngine: any;
  private policyEngine: any;
  private circuitBreaker: any;
  private retryManager: any;

  constructor(
    diContainer: DIContainer,
    registry: IWorkflowRegistry,
    memory: IWorkflowMemory,
    observability: IWorkflowObservability
  ) {
    this.diContainer = diContainer;
    this.registry = registry;
    this.memory = memory;
    this.observability = observability;
  }

  private lazyResolveEngines() {
    if (!this.toolExecutor) {
      this.toolExecutor = this.diContainer.resolve<any>("IToolExecutor");
      this.toolRegistry = this.diContainer.resolve<any>("IToolRegistry");
      this.validationEngine = this.diContainer.resolve<any>("IValidationEngine");
      this.permissionEngine = this.diContainer.resolve<any>("IPermissionEngine");
      this.policyEngine = this.diContainer.resolve<any>("IPolicyEngine");
      this.circuitBreaker = this.diContainer.resolve<any>("ICircuitBreakerEngine");
      this.retryManager = this.diContainer.resolve<any>("IRetryManager");

      if (this.toolRegistry && !this.toolRegistry.getTool("automation_step")) {
        this.toolRegistry.registerTool({
          name: "automation_step",
          description: "Executes automation step",
          schema: { type: "object", properties: {} },
          execute: async (context: any, args: any) => {
            const { step, trigger, message, businessId, leadId } = args;
            const prisma = (await import("../../config/prisma")).default;
            const { executionId, flowId } = trigger;

            if (!step) return null;

            if (step.stepType === "MESSAGE" || step.stepType === "SEND_MESSAGE") {
              if (!step.message) return null;
              if (step.nextStep) {
                await prisma.automationExecution.update({
                  where: { id: executionId },
                  data: { currentStep: step.nextStep },
                });
              } else {
                await prisma.automationExecution.update({
                  where: { id: executionId },
                  data: { status: "COMPLETED" },
                });
              }
              return step.message;
            }

            if (step.stepType === "CONDITION") {
              const cleanMessage = message.toLowerCase().replace(/[^\w\s]/g, "");
              const condition = step.condition?.toLowerCase().replace(/[^\w\s]/g, "");
              if (!condition) return null;
              const regex = new RegExp(`\\b${condition}\\b`);
              const matched = regex.test(cleanMessage);
              if (!matched) return null;

              const nextStep = await prisma.automationStep.findFirst({
                where: { flowId, stepKey: step.nextStep || "" },
              });
              if (!nextStep) return null;

              await prisma.automationExecution.update({
                where: { id: executionId },
                data: { currentStep: nextStep.stepKey },
              });

              if (nextStep.stepType === "MESSAGE" || nextStep.stepType === "SEND_MESSAGE") {
                return nextStep.message || null;
              }
              return null;
            }

            if (step.stepType === "DELAY") {
              return null;
            }

            if (step.stepType === "END") {
              await prisma.automationExecution.update({
                where: { id: executionId },
                data: { status: "COMPLETED" },
              });
              return null;
            }

            return null;
          }
        });
      }
    }
  }

  public async executeWorkflow(instanceId: string): Promise<void> {
    this.lazyResolveEngines();
    const instance = await this.memory.getInstance(instanceId);
    if (!instance) {
      throw new Error(`Workflow instance [${instanceId}] not found.`);
    }

    const definition = await this.registry.getWorkflow(instance.definitionId, instance.version);
    if (!definition) {
      throw new Error(`Workflow definition [${instance.definitionId}] not found.`);
    }

    await this.transitionState(instance, "Running");

    try {
      while (instance.stepIndex < definition.steps.length) {
        const step = definition.steps[instance.stepIndex];

        // Saga Support: save checkpoint before step execution
        await this.memory.saveCheckpoint(instanceId, {
          stepIndex: instance.stepIndex,
          variables: { ...instance.variables },
          timestamp: new Date(),
          compensationStack: [...instance.compensationStack]
        });

        // Human Approval Check
        const stepApproved = instance.variables[`approved_step_${instance.stepIndex}`] === true;
        if (step.requireApproval && !stepApproved) {
          await this.transitionState(instance, "Waiting", step.id, {
            requireApproval: true,
            approvalRole: step.approvalRole || "admin"
          });
          return; // Pause execution loop
        }

        // Execute step action via Action Pipeline
        const result = await this.executeActionPipeline(instance, step);

        // Map Outputs
        if (step.outputMap) {
          for (const [toolKey, varKey] of Object.entries(step.outputMap)) {
            if (result && typeof result === "object" && toolKey in result) {
              instance.variables[varKey] = (result as any)[toolKey];
            } else if (result !== undefined) {
              instance.variables[varKey] = result;
            }
          }
        } else if (result !== undefined && result !== null) {
          if (typeof result === "object") {
            instance.variables = { ...instance.variables, ...result };
          } else {
            instance.variables[`step_${step.id}_output`] = result;
          }
        }

        // Push to Compensation Stack
        if (step.compensateAction) {
          instance.compensationStack.push(step.id);
        }

        instance.stepIndex++;
        await this.memory.updateInstance(instance.id, {
          stepIndex: instance.stepIndex,
          compensationStack: instance.compensationStack,
          variables: instance.variables
        });
      }

      await this.transitionState(instance, "Completed");
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      console.error(`[Workflow Orchestrator] Execution failed at step [${instance.stepIndex}] for instance [${instance.id}]:`, errorMsg);
      
      this.observability.recordMetrics(instance.id, "failure", 1, { stepIndex: String(instance.stepIndex) });
      
      await this.transitionState(instance, "Failed", undefined, { error: errorMsg });
      await this.memory.updateInstance(instance.id, { failureReason: errorMsg });

      // Run compensation rollback (Saga)
      await this.compensateWorkflow(instanceId);

      // Dead Letter Workflow Quarantine
      await this.quarantineWorkflow(instanceId, errorMsg);
    }
  }

  public async resumeWorkflow(
    instanceId: string,
    approvalResult?: "approve" | "reject" | "delegate" | "escalate",
    variables: Record<string, any> = {}
  ): Promise<void> {
    const instance = await this.memory.getInstance(instanceId);
    if (!instance) {
      throw new Error(`Workflow instance [${instanceId}] not found.`);
    }

    if (instance.state !== "Waiting" && instance.state !== "Paused") {
      throw new Error(`Workflow instance [${instanceId}] is not in Waiting/Paused state (current: ${instance.state}).`);
    }

    // Apply new/updated variables
    if (Object.keys(variables).length > 0) {
      instance.variables = { ...instance.variables, ...variables };
      await this.memory.updateInstance(instanceId, { variables: instance.variables });
    }

    if (approvalResult === "approve") {
      await this.transitionState(instance, "Approved");
      instance.variables[`approved_step_${instance.stepIndex}`] = true;
      await this.memory.updateInstance(instanceId, { variables: instance.variables });
      // Continue execution asynchronously
      void this.executeWorkflow(instanceId);
    } else if (approvalResult === "reject") {
      await this.transitionState(instance, "Rejected");
      await this.compensateWorkflow(instanceId);
      await this.quarantineWorkflow(instanceId, "Human approval rejected.");
    } else if (approvalResult === "delegate") {
      await this.transitionState(instance, "Paused", undefined, { delegation: "delegated" });
    } else if (approvalResult === "escalate") {
      await this.transitionState(instance, "Paused", undefined, { escalation: "escalated" });
    }
  }

  public async compensateWorkflow(instanceId: string): Promise<void> {
    this.lazyResolveEngines();
    const instance = await this.memory.getInstance(instanceId);
    if (!instance) return;

    const definition = await this.registry.getWorkflow(instance.definitionId, instance.version);
    if (!definition) return;

    const originalState = instance.state;
    await this.transitionState(instance, "Retrying", undefined, { mode: "compensating" });

    // Reverse compensation execution
    while (instance.compensationStack.length > 0) {
      const stepId = instance.compensationStack.pop()!;
      const step = definition.steps.find(s => s.id === stepId);
      if (step && step.compensateAction) {
        try {
          console.log(`[Workflow Orchestrator] Triggering compensation action [${step.compensateAction}] for step [${stepId}]`);
          
          const compensateArgs: Record<string, any> = {};
          if (step.compensateInputMap) {
            for (const [toolKey, varKey] of Object.entries(step.compensateInputMap)) {
              compensateArgs[toolKey] = instance.variables[varKey];
            }
          } else {
            // Default pass all variables
            Object.assign(compensateArgs, instance.variables);
          }

          const tenantId = instance.variables.tenantId || instance.variables.businessId || "default";
          const userId = instance.variables.userId || "system";
          const roles = Array.isArray(instance.variables.roles) ? instance.variables.roles : (instance.variables.role ? [instance.variables.role] : ["admin"]);

          // Execute compensation action
          await this.toolExecutor.execute({ tenantId, actorId: userId, roles }, step.compensateAction, compensateArgs);
        } catch (compErr) {
          console.error(`[Workflow Orchestrator] Compensation step [${stepId}] failed:`, compErr);
          this.observability.recordMetrics(instance.id, "compensation_failure", 1, { stepId });
        }
      }
      await this.memory.updateInstance(instance.id, { compensationStack: instance.compensationStack });
    }

    await this.transitionState(instance, originalState === "Rejected" ? "Rejected" : "Failed");
  }

  public async quarantineWorkflow(instanceId: string, reason: string): Promise<void> {
    const instance = await this.memory.getInstance(instanceId);
    if (!instance) return;

    await this.memory.updateInstance(instanceId, {
      quarantined: true,
      failureReason: reason
    });
    console.warn(`[Workflow Orchestrator] Workflow instance [${instanceId}] quarantined: ${reason}`);
    this.observability.recordMetrics(instanceId, "quarantine", 1, { reason });
  }

  public async replayQuarantinedWorkflow(instanceId: string): Promise<void> {
    const instance = await this.memory.getInstance(instanceId);
    if (!instance) {
      throw new Error(`Quarantined workflow instance [${instanceId}] not found.`);
    }

    if (!instance.quarantined) {
      throw new Error(`Workflow instance [${instanceId}] is not quarantined.`);
    }

    console.log(`[Workflow Orchestrator] Replaying quarantined workflow instance [${instanceId}]`);
    await this.memory.updateInstance(instanceId, {
      quarantined: false,
      state: "Queued"
    });

    void this.executeWorkflow(instanceId);
  }

  private async executeActionPipeline(instance: WorkflowInstance, step: WorkflowStep): Promise<any> {
    const startTime = Date.now();
    this.observability.recordMetrics(instance.id, "step_started", 1, { stepId: step.id });

    // Build step input arguments
    const stepArgs: Record<string, any> = {};
    if (step.inputMap) {
      for (const [toolKey, varKey] of Object.entries(step.inputMap)) {
        stepArgs[toolKey] = instance.variables[varKey];
      }
    } else {
      // Default to passing all workflow variables
      Object.assign(stepArgs, instance.variables);
    }

    const tenantId = instance.variables.tenantId || instance.variables.businessId || "default";
    const userId = instance.variables.userId || "system";
    const roles = Array.isArray(instance.variables.roles) ? instance.variables.roles : (instance.variables.role ? [instance.variables.role] : ["admin"]);

    const execContext = {
      tenantId,
      userId,
      requestId: `wf_req_${instance.id}`,
      roles,
      correlationId: instance.id
    };

    // 1. Validation Engine Check
    if (this.validationEngine) {
      const safety = this.validationEngine.validateSafety(stepArgs);
      if (!safety.isSafe) {
        throw new Error(`Validation safety violation on step [${step.id}]: ${safety.blockReason}`);
      }
      const tool = this.toolRegistry?.getTool(step.action);
      if (tool) {
        const inputCheck = this.validationEngine.validateInput(tool.schema, stepArgs);
        if (!inputCheck.isValid) {
          throw new Error(`Schema validation failed on step [${step.id}]: ${inputCheck.errors.join("; ")}`);
        }
      }
    }

    // 2. Permission Engine Check
    if (this.permissionEngine) {
      const tool = this.toolRegistry?.getTool(step.action);
      if (tool) {
        const auth = this.permissionEngine.authorize(execContext, tool);
        if (!auth.authorized) {
          throw new Error(`Permission denied on step [${step.id}]: ${auth.reason || "Unauthorized tool access."}`);
        }
      }
    }

    // 3. Policy Engine Check
    if (this.policyEngine) {
      const policy = this.policyEngine.evaluate(execContext, stepArgs);
      if (!policy.allowed) {
        throw new Error(`Policy violation on step [${step.id}]: ${policy.reasons.join("; ")}`);
      }
    }

    // 4. Circuit Breaker Check
    if (this.circuitBreaker && !this.circuitBreaker.canExecute(step.action)) {
      throw new Error(`Circuit breaker is open (disabled) for step action [${step.action}].`);
    }

    // 5. Tool Executor (which handles retries & circuit breaking internally)
    let result: any;
    try {
      result = await this.toolExecutor.execute(
        { tenantId, actorId: userId, roles },
        step.action,
        stepArgs
      );
    } catch (err: any) {
      this.observability.recordMetrics(instance.id, "failure", 1, { stepId: step.id });
      throw err;
    }

    const latency = Date.now() - startTime;
    this.observability.recordMetrics(instance.id, "latency", latency, { stepId: step.id });
    this.observability.recordMetrics(instance.id, "success", 1, { stepId: step.id });

    return result;
  }

  private async transitionState(
    instance: WorkflowInstance,
    newState: WorkflowState,
    stepId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const historyEntry = {
      timestamp: new Date(),
      stepId,
      state: newState,
      metadata
    };
    instance.history.push(historyEntry);
    instance.state = newState;
    await this.memory.updateInstance(instance.id, {
      state: newState,
      history: instance.history
    });
  }
}
