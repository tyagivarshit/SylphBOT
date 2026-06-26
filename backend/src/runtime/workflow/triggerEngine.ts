import { IWorkflowTriggerEngine, IWorkflowRegistry, IWorkflowMemory, IWorkflowOrchestrator, WorkflowInstance } from "../interfaces/workflow";
import { IEventBus } from "../interfaces/execution";

export class WorkflowTriggerEngine implements IWorkflowTriggerEngine {
  private registry: IWorkflowRegistry;
  private memory: IWorkflowMemory;
  private orchestrator: IWorkflowOrchestrator;
  private eventBus?: any;

  constructor(
    registry: IWorkflowRegistry,
    memory: IWorkflowMemory,
    orchestrator: IWorkflowOrchestrator,
    eventBus?: any
  ) {
    this.registry = registry;
    this.memory = memory;
    this.orchestrator = orchestrator;
    this.eventBus = eventBus;

    // If event bus is present, we will dynamically subscribe to topics when workflows are registered
    // But since trigger engine might be registered before all workflows, we can also subscribe dynamically on registry updates
  }

  public async handleEvent(topic: string, payload: Record<string, any>): Promise<void> {
    const workflows = await this.registry.listWorkflows();
    const matches = workflows.filter(w => 
      w.status === "ACTIVE" && 
      w.triggers.some(t => t.type === "event" && t.topic === topic)
    );

    for (const def of matches) {
      await this.createAndExecute(def.id, def.version, { ...payload, triggerEvent: { topic, payload } });
    }
  }

  public async handleSignal(signalName: string, payload: Record<string, any>): Promise<void> {
    const workflows = await this.registry.listWorkflows();
    const matches = workflows.filter(w => 
      w.status === "ACTIVE" && 
      w.triggers.some(t => t.type === "signal" && t.signalName === signalName)
    );

    for (const def of matches) {
      await this.createAndExecute(def.id, def.version, { ...payload, triggerSignal: { name: signalName, payload } });
    }
  }

  public async triggerManual(definitionId: string, version?: string, variables: Record<string, any> = {}): Promise<string> {
    return this.createAndExecute(definitionId, version, { ...variables, triggerSource: "manual" });
  }

  public async triggerAPI(definitionId: string, version?: string, variables: Record<string, any> = {}): Promise<string> {
    return this.createAndExecute(definitionId, version, { ...variables, triggerSource: "api" });
  }

  private async createAndExecute(definitionId: string, version?: string, variables: Record<string, any> = {}): Promise<string> {
    const definition = await this.registry.getWorkflow(definitionId, version);
    if (!definition) {
      throw new Error(`Workflow definition [${definitionId}] not found.`);
    }
    if (definition.status === "DEPRECATED") {
      throw new Error(`Workflow definition [${definitionId}] is DEPRECATED.`);
    }

    const instanceId = `wf_inst_${definitionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const instance: WorkflowInstance = {
      id: instanceId,
      definitionId: definition.id,
      version: definition.version,
      state: "Created",
      variables,
      history: [
        {
          timestamp: new Date(),
          state: "Created",
          metadata: { trigger: variables.triggerSource || "event" }
        }
      ],
      checkpoints: [],
      stepIndex: 0,
      compensationStack: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.memory.createInstance(instance);
    
    // Execute asynchronously (non-blocking)
    void this.orchestrator.executeWorkflow(instanceId).catch(err => {
      console.error(`[Workflow Trigger Engine] Execution failed for instance [${instanceId}]:`, err);
    });

    return instanceId;
  }
}
