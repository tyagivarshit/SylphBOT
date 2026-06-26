import assert from "node:assert/strict";
import { container } from "../runtime/kernel/diContainer";
import { bootstrapper } from "../runtime/kernel/bootstrap";
import {
  WorkflowDefinition,
  IWorkflowRegistry,
  IWorkflowMemory,
  IWorkflowOrchestrator,
  IWorkflowTriggerEngine,
  IWorkflowObservability,
  WorkflowInstance
} from "../runtime/interfaces/workflow";
import { IToolRegistry, IEventBus } from "../runtime/interfaces/execution";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

// Reset DI store and bootstrap runtime before tests
const initRuntime = async () => {
  container.reset();
  await bootstrapper.bootstrap({ skipValidation: true });
};

export const workflowRuntimeTests: TestCase[] = [
  {
    name: "workflow registry - registers, versions, deprecates, and lists definitions",
    run: async () => {
      await initRuntime();
      const registry = container.resolve<IWorkflowRegistry>("IWorkflowRegistry");

      const def1: WorkflowDefinition = {
        id: "wf_test_1",
        name: "Test Workflow 1",
        version: "1.0.0",
        status: "ACTIVE",
        steps: [
          { id: "step_a", name: "Step A", action: "test_tool_a" }
        ],
        triggers: [],
        dependencies: [],
        metadata: {}
      };

      const def1v2: WorkflowDefinition = {
        id: "wf_test_1",
        name: "Test Workflow 1",
        version: "1.1.0",
        status: "ACTIVE",
        steps: [
          { id: "step_a", name: "Step A", action: "test_tool_a" },
          { id: "step_b", name: "Step B", action: "test_tool_b" }
        ],
        triggers: [],
        dependencies: [],
        metadata: {}
      };

      await registry.registerWorkflow(def1);
      await registry.registerWorkflow(def1v2);

      // Verify listing all
      const list = await registry.listWorkflows();
      assert.ok(list.length >= 2);

      // Verify retrieval of default (latest active)
      const latest = await registry.getWorkflow("wf_test_1");
      assert.equal(latest?.version, "1.1.0");

      // Verify explicit version retrieval
      const v1 = await registry.getWorkflow("wf_test_1", "1.0.0");
      assert.equal(v1?.version, "1.0.0");

      // Deprecate v1
      await registry.deprecateWorkflow("wf_test_1", "1.0.0");
      const v1Dep = await registry.getWorkflow("wf_test_1", "1.0.0");
      assert.equal(v1Dep?.status, "DEPRECATED");
    }
  },
  {
    name: "workflow orchestrator - executes multi-step workflow through action pipeline",
    run: async () => {
      await initRuntime();
      const registry = container.resolve<IWorkflowRegistry>("IWorkflowRegistry");
      const memory = container.resolve<IWorkflowMemory>("IWorkflowMemory");
      const orchestrator = container.resolve<IWorkflowOrchestrator>("IWorkflowOrchestrator");
      const toolRegistry = container.resolve<IToolRegistry>("IToolRegistry");
      const observability = container.resolve<IWorkflowObservability>("IWorkflowObservability");

      // Register dummy tools
      let step1Executed = false;
      let step2Executed = false;
      let step1Input: any = null;

      toolRegistry.registerTool({
        name: "step_one",
        description: "Step One Test Tool",
        schema: {
          type: "object",
          properties: {
            inputValue: { type: "string" }
          },
          required: ["inputValue"]
        },
        execute: async (context: any, args: any) => {
          step1Executed = true;
          step1Input = args.inputValue;
          return { outputValue: "processed_one" };
        }
      });

      toolRegistry.registerTool({
        name: "step_two",
        description: "Step Two Test Tool",
        schema: {
          type: "object",
          properties: {
            inputValue: { type: "string" }
          },
          required: ["inputValue"]
        },
        execute: async (context: any, args: any) => {
          step2Executed = true;
          return { outputValue: args.inputValue + "_two" };
        }
      });

      const def: WorkflowDefinition = {
        id: "wf_exec_test",
        name: "Execution Test Workflow",
        version: "1.0.0",
        status: "ACTIVE",
        steps: [
          {
            id: "s1",
            name: "First step",
            action: "step_one",
            inputMap: { inputValue: "startVar" },
            outputMap: { outputValue: "midVar" }
          },
          {
            id: "s2",
            name: "Second step",
            action: "step_two",
            inputMap: { inputValue: "midVar" },
            outputMap: { outputValue: "endVar" }
          }
        ],
        triggers: [],
        dependencies: [],
        metadata: {}
      };

      await registry.registerWorkflow(def);

      const instId = "inst_exec_1";
      const instance: WorkflowInstance = {
        id: instId,
        definitionId: "wf_exec_test",
        version: "1.0.0",
        state: "Created",
        variables: { startVar: "initial" },
        history: [],
        checkpoints: [],
        stepIndex: 0,
        compensationStack: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await memory.createInstance(instance);

      // Execute Workflow
      await orchestrator.executeWorkflow(instId);

      // Verify outcomes
      const endedInstance = await memory.getInstance(instId);
      assert.equal(endedInstance?.state, "Completed");
      assert.equal(endedInstance?.stepIndex, 2);
      assert.ok(step1Executed);
      assert.ok(step2Executed);
      assert.equal(step1Input, "initial");
      assert.equal(endedInstance?.variables["midVar"], "processed_one");
      assert.equal(endedInstance?.variables["endVar"], "processed_one_two");

      // Verify observability metrics
      const metrics = await observability.getMetrics({ instanceId: instId });
      assert.equal(metrics.totalSuccess, 2);
      assert.ok(metrics.averageLatencyMs >= 0);
    }
  },
  {
    name: "workflow saga - compensation engine triggers rollback on failure and quarantines workflow",
    run: async () => {
      await initRuntime();
      const registry = container.resolve<IWorkflowRegistry>("IWorkflowRegistry");
      const memory = container.resolve<IWorkflowMemory>("IWorkflowMemory");
      const orchestrator = container.resolve<IWorkflowOrchestrator>("IWorkflowOrchestrator");
      const toolRegistry = container.resolve<IToolRegistry>("IToolRegistry");

      let step1Compensated = false;
      let compArgs: any = null;

      // Register step 1 tool + compensation tool
      toolRegistry.registerTool({
        name: "saga_step_1",
        description: "Saga Step 1 Tool",
        schema: { type: "object", properties: {} },
        execute: async () => {
          return { success: true };
        }
      });

      toolRegistry.registerTool({
        name: "saga_step_1_rollback",
        description: "Saga Step 1 Rollback Tool",
        schema: { type: "object", properties: { key: { type: "string" } } },
        execute: async (context: any, args: any) => {
          step1Compensated = true;
          compArgs = args;
          return { rolledBack: true };
        }
      });

      // Register step 2 tool that fails
      toolRegistry.registerTool({
        name: "saga_step_2_fail",
        description: "Saga Step 2 Fail Tool",
        schema: { type: "object", properties: {} },
        execute: async () => {
          throw new Error("Saga step 2 hard failure.");
        }
      });

      const def: WorkflowDefinition = {
        id: "wf_saga_test",
        name: "Saga Test Workflow",
        version: "1.0.0",
        status: "ACTIVE",
        steps: [
          {
            id: "step1",
            name: "Step 1",
            action: "saga_step_1",
            compensateAction: "saga_step_1_rollback",
            compensateInputMap: { key: "testKey" }
          },
          {
            id: "step2",
            name: "Step 2 Fails",
            action: "saga_step_2_fail"
          }
        ],
        triggers: [],
        dependencies: [],
        metadata: {}
      };

      await registry.registerWorkflow(def);

      const instId = "inst_saga_1";
      const instance: WorkflowInstance = {
        id: instId,
        definitionId: "wf_saga_test",
        version: "1.0.0",
        state: "Created",
        variables: { testKey: "testValue" },
        history: [],
        checkpoints: [],
        stepIndex: 0,
        compensationStack: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await memory.createInstance(instance);

      // Execute Orchestrator
      await orchestrator.executeWorkflow(instId);

      const endedInstance = await memory.getInstance(instId);
      assert.equal(endedInstance?.state, "Failed");
      assert.ok(step1Compensated);
      assert.equal(compArgs?.key, "testValue");
      assert.equal(endedInstance?.quarantined, true);
      assert.match(endedInstance?.failureReason || "", /Saga step 2 hard failure/);
    }
  },
  {
    name: "workflow triggers - handles event bus triggers automatically",
    run: async () => {
      await initRuntime();
      const registry = container.resolve<IWorkflowRegistry>("IWorkflowRegistry");
      const memory = container.resolve<IWorkflowMemory>("IWorkflowMemory");
      const eventBus = container.resolve<any>("IEventBus");
      const triggerEngine = container.resolve<IWorkflowTriggerEngine>("IWorkflowTriggerEngine");
      const toolRegistry = container.resolve<IToolRegistry>("IToolRegistry");

      let toolExecuted = false;
      let payloadReceived: any = null;

      toolRegistry.registerTool({
        name: "triggered_tool",
        description: "Triggered Tool",
        schema: { type: "object", properties: {} },
        execute: async (context: any, args: any) => {
          toolExecuted = true;
          payloadReceived = args;
        }
      });

      const def: WorkflowDefinition = {
        id: "wf_trigger_test",
        name: "Trigger Test Workflow",
        version: "1.0.0",
        status: "ACTIVE",
        steps: [
          { id: "st1", name: "Trigger Step", action: "triggered_tool" }
        ],
        triggers: [
          { type: "event", topic: "order.created" }
        ],
        dependencies: [],
        metadata: {}
      };

      // Register contract in ContractRegistry
      const contractRegistry = container.resolve<any>("IContractRegistry");
      contractRegistry.registerContract({
        name: "order.created",
        version: "1.0.0",
        schema: {
          orderId: "string" as const,
          tenantId: "string" as const
        }
      });

      // Register workflow (will auto-subscribe to event bus via decorated registerWorkflow)
      await registry.registerWorkflow(def);

      // Publish event to EventBus with correct 4-arg signature
      await eventBus.publish(
        "order.created",
        "1.0.0",
        { orderId: "ord_999", tenantId: "default" },
        { tenantId: "default" }
      );

      // Allow trigger async execution to spin
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.ok(toolExecuted);
      assert.equal(payloadReceived?.orderId, "ord_999");
    }
  },
  {
    name: "workflow approval - pauses for approval and resumes upon approve signal",
    run: async () => {
      await initRuntime();
      const registry = container.resolve<IWorkflowRegistry>("IWorkflowRegistry");
      const memory = container.resolve<IWorkflowMemory>("IWorkflowMemory");
      const orchestrator = container.resolve<IWorkflowOrchestrator>("IWorkflowOrchestrator");
      const toolRegistry = container.resolve<IToolRegistry>("IToolRegistry");

      let finalStepExecuted = false;

      toolRegistry.registerTool({
        name: "post_approval_tool",
        description: "Post Approval Tool",
        schema: { type: "object", properties: {} },
        execute: async () => {
          finalStepExecuted = true;
        }
      });

      const def: WorkflowDefinition = {
        id: "wf_approval_test",
        name: "Approval Test Workflow",
        version: "1.0.0",
        status: "ACTIVE",
        steps: [
          { id: "st_approve", name: "Requires approval step", action: "post_approval_tool", requireApproval: true }
        ],
        triggers: [],
        dependencies: [],
        metadata: {}
      };

      await registry.registerWorkflow(def);

      const instId = "inst_approval_1";
      const instance: WorkflowInstance = {
        id: instId,
        definitionId: "wf_approval_test",
        version: "1.0.0",
        state: "Created",
        variables: {},
        history: [],
        checkpoints: [],
        stepIndex: 0,
        compensationStack: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await memory.createInstance(instance);

      // Start execution
      await orchestrator.executeWorkflow(instId);

      // Verify paused
      let currentInst = await memory.getInstance(instId);
      assert.equal(currentInst?.state, "Waiting");
      assert.equal(finalStepExecuted, false);

      // Resume execution with Approved signal
      await orchestrator.resumeWorkflow(instId, "approve");

      // Give event loop time to process async execution
      await new Promise(resolve => setTimeout(resolve, 50));

      currentInst = await memory.getInstance(instId);
      assert.equal(currentInst?.state, "Completed");
      assert.equal(finalStepExecuted, true);
    }
  },
  {
    name: "workflow quarantine & replay - allows replaying quarantined workflow after correction",
    run: async () => {
      await initRuntime();
      const registry = container.resolve<IWorkflowRegistry>("IWorkflowRegistry");
      const memory = container.resolve<IWorkflowMemory>("IWorkflowMemory");
      const orchestrator = container.resolve<IWorkflowOrchestrator>("IWorkflowOrchestrator");
      const toolRegistry = container.resolve<IToolRegistry>("IToolRegistry");

      let attempts = 0;
      toolRegistry.registerTool({
        name: "replayable_tool",
        description: "Replayable Tool",
        schema: { type: "object", properties: { correctParam: { type: "string" } } },
        execute: async (context: any, args: any) => {
          attempts++;
          if (args.correctParam !== "valid") {
            throw new Error("Invalid parameter supplied.");
          }
          return { ok: true };
        }
      });

      const def: WorkflowDefinition = {
        id: "wf_replay_test",
        name: "Replay Test Workflow",
        version: "1.0.0",
        status: "ACTIVE",
        steps: [
          { id: "rep1", name: "Replayable step", action: "replayable_tool", inputMap: { correctParam: "paramKey" } }
        ],
        triggers: [],
        dependencies: [],
        metadata: {}
      };

      await registry.registerWorkflow(def);

      const instId = "inst_replay_1";
      const instance: WorkflowInstance = {
        id: instId,
        definitionId: "wf_replay_test",
        version: "1.0.0",
        state: "Created",
        variables: { paramKey: "invalid" },
        history: [],
        checkpoints: [],
        stepIndex: 0,
        compensationStack: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await memory.createInstance(instance);

      // Execute (fails, goes to quarantine)
      await orchestrator.executeWorkflow(instId);

      let currentInst = await memory.getInstance(instId);
      assert.equal(currentInst?.state, "Failed");
      assert.equal(currentInst?.quarantined, true);
      assert.equal(attempts, 3);

      // Resolve the parameter in variables
      await memory.updateInstance(instId, { variables: { paramKey: "valid" } });

      // Reset circuit breaker state for replayable_tool
      const cb = container.resolve<any>("ICircuitBreakerEngine");
      if (cb && cb.states) {
        cb.states.clear();
      }

      // Replay Workflow
      await orchestrator.replayQuarantinedWorkflow(instId);

      // Give event loop time to process async execution
      await new Promise(resolve => setTimeout(resolve, 50));

      currentInst = await memory.getInstance(instId);
      assert.equal(currentInst?.state, "Completed");
      assert.equal(currentInst?.quarantined, false);
      assert.equal(attempts, 4);
    }
  }
];
