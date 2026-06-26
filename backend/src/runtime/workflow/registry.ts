import { IWorkflowRegistry, WorkflowDefinition } from "../interfaces/workflow";

export class WorkflowRegistry implements IWorkflowRegistry {
  private definitions = new Map<string, WorkflowDefinition[]>();

  public async registerWorkflow(definition: WorkflowDefinition): Promise<void> {
    if (!definition.id || !definition.name || !definition.version) {
      throw new Error("Workflow registration failed: id, name, and version are required.");
    }
    if (!definition.steps || definition.steps.length === 0) {
      throw new Error(`Workflow [${definition.id}] has no steps defined.`);
    }

    const versions = this.definitions.get(definition.id) || [];
    const exists = versions.some(v => v.version === definition.version);
    if (exists) {
      throw new Error(`Workflow [${definition.id}] with version [${definition.version}] is already registered.`);
    }

    versions.push({ ...definition });
    this.definitions.set(definition.id, versions);
    console.log(`[Workflow Registry] Registered workflow [${definition.name}] v[${definition.version}]`);
  }

  public async deprecateWorkflow(id: string, version: string): Promise<void> {
    const versions = this.definitions.get(id);
    if (!versions) {
      throw new Error(`Workflow [${id}] not found.`);
    }
    const def = versions.find(v => v.version === version);
    if (!def) {
      throw new Error(`Workflow [${id}] v[${version}] not found.`);
    }
    def.status = "DEPRECATED";
    console.log(`[Workflow Registry] Deprecated workflow [${id}] v[${version}]`);
  }

  public async getWorkflow(id: string, version?: string): Promise<WorkflowDefinition | null> {
    const versions = this.definitions.get(id);
    if (!versions || versions.length === 0) {
      return null;
    }
    if (version) {
      return versions.find(v => v.version === version) || null;
    }
    // Return latest active or last version
    const active = [...versions].reverse().find(v => v.status === "ACTIVE");
    return active || versions[versions.length - 1];
  }

  public async listWorkflows(): Promise<WorkflowDefinition[]> {
    const list: WorkflowDefinition[] = [];
    for (const versions of this.definitions.values()) {
      list.push(...versions);
    }
    return list;
  }

  public reset(): void {
    this.definitions.clear();
  }
}
