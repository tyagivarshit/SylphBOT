import { IWorkflowMemory, WorkflowInstance, WorkflowCheckpoint } from "../interfaces/workflow";

export class WorkflowMemory implements IWorkflowMemory {
  private instances = new Map<string, WorkflowInstance>();

  public async createInstance(instance: WorkflowInstance): Promise<void> {
    if (this.instances.has(instance.id)) {
      throw new Error(`Workflow instance [${instance.id}] already exists.`);
    }
    this.instances.set(instance.id, {
      ...instance,
      history: [...instance.history],
      checkpoints: [...instance.checkpoints],
      compensationStack: [...instance.compensationStack]
    });
  }

  public async updateInstance(instanceId: string, updates: Partial<WorkflowInstance>): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Workflow instance [${instanceId}] not found.`);
    }

    const updated = {
      ...instance,
      ...updates,
      updatedAt: new Date()
    };

    if (updates.history) updated.history = [...updates.history];
    if (updates.checkpoints) updated.checkpoints = [...updates.checkpoints];
    if (updates.compensationStack) updated.compensationStack = [...updates.compensationStack];
    if (updates.variables) updated.variables = { ...instance.variables, ...updates.variables };

    this.instances.set(instanceId, updated);
  }

  public async getInstance(instanceId: string): Promise<WorkflowInstance | null> {
    const instance = this.instances.get(instanceId);
    if (!instance) return null;
    return {
      ...instance,
      history: [...instance.history],
      checkpoints: [...instance.checkpoints],
      compensationStack: [...instance.compensationStack],
      variables: { ...instance.variables }
    };
  }

  public async saveCheckpoint(instanceId: string, checkpoint: WorkflowCheckpoint): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Workflow instance [${instanceId}] not found.`);
    }
    const checkpoints = [...instance.checkpoints, { ...checkpoint, compensationStack: [...checkpoint.compensationStack], variables: { ...checkpoint.variables } }];
    this.instances.set(instanceId, {
      ...instance,
      checkpoints,
      updatedAt: new Date()
    });
  }

  public async getQuarantinedInstances(): Promise<WorkflowInstance[]> {
    const list: WorkflowInstance[] = [];
    for (const inst of this.instances.values()) {
      if (inst.quarantined) {
        list.push({
          ...inst,
          history: [...inst.history],
          checkpoints: [...inst.checkpoints],
          compensationStack: [...inst.compensationStack],
          variables: { ...inst.variables }
        });
      }
    }
    return list;
  }

  public resetStore(): void {
    this.instances.clear();
  }
}
