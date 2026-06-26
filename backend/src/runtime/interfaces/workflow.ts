export type WorkflowState =
  | "Created"
  | "Queued"
  | "Running"
  | "Waiting"
  | "Paused"
  | "Approved"
  | "Rejected"
  | "Retrying"
  | "Completed"
  | "Cancelled"
  | "Failed"
  | "Archived";

export interface WorkflowStep {
  id: string;
  name: string;
  action: string; // The tool name (registered in ToolRegistry)
  inputMap?: Record<string, string>; // Maps workflow variable keys to tool arguments keys
  outputMap?: Record<string, string>; // Maps tool return properties to workflow variable keys
  compensateAction?: string; // Rollback tool name
  compensateInputMap?: Record<string, string>;
  requireApproval?: boolean;
  approvalRole?: string;
  timeoutMs?: number;
  retryCount?: number;
  backoffMs?: number;
}

export interface WorkflowTrigger {
  type: "event" | "schedule" | "manual" | "api" | "signal";
  topic?: string; // For event bus
  cronExpression?: string; // For schedule
  signalName?: string; // For signal
  criteria?: Record<string, any>;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: string;
  status: "ACTIVE" | "DEPRECATED" | "DRAFT";
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
  dependencies: string[];
  metadata: Record<string, any>;
}

export interface WorkflowHistoryEntry {
  timestamp: Date;
  stepId?: string;
  state: WorkflowState;
  action?: string;
  result?: any;
  error?: string;
  metadata?: Record<string, any>;
}

export interface WorkflowCheckpoint {
  stepIndex: number;
  variables: Record<string, any>;
  timestamp: Date;
  compensationStack: string[];
}

export interface WorkflowInstance {
  id: string;
  definitionId: string;
  version: string;
  state: WorkflowState;
  variables: Record<string, any>;
  history: WorkflowHistoryEntry[];
  checkpoints: WorkflowCheckpoint[];
  stepIndex: number;
  compensationStack: string[];
  quarantined?: boolean;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWorkflowRegistry {
  registerWorkflow(definition: WorkflowDefinition): Promise<void>;
  deprecateWorkflow(id: string, version: string): Promise<void>;
  getWorkflow(id: string, version?: string): Promise<WorkflowDefinition | null>;
  listWorkflows(): Promise<WorkflowDefinition[]>;
  reset(): void;
}

export interface IWorkflowTriggerEngine {
  handleEvent(topic: string, payload: Record<string, any>): Promise<void>;
  handleSignal(signalName: string, payload: Record<string, any>): Promise<void>;
  triggerManual(definitionId: string, version?: string, variables?: Record<string, any>): Promise<string>;
  triggerAPI(definitionId: string, version?: string, variables?: Record<string, any>): Promise<string>;
}

export interface IWorkflowOrchestrator {
  executeWorkflow(instanceId: string): Promise<void>;
  resumeWorkflow(
    instanceId: string,
    approvalResult?: "approve" | "reject" | "delegate" | "escalate",
    variables?: Record<string, any>
  ): Promise<void>;
  compensateWorkflow(instanceId: string): Promise<void>;
  quarantineWorkflow(instanceId: string, reason: string): Promise<void>;
  replayQuarantinedWorkflow(instanceId: string): Promise<void>;
}

export interface IWorkflowMemory {
  createInstance(instance: WorkflowInstance): Promise<void>;
  updateInstance(instanceId: string, updates: Partial<WorkflowInstance>): Promise<void>;
  getInstance(instanceId: string): Promise<WorkflowInstance | null>;
  saveCheckpoint(instanceId: string, checkpoint: WorkflowCheckpoint): Promise<void>;
  getQuarantinedInstances(): Promise<WorkflowInstance[]>;
  resetStore(): void;
}

export interface IWorkflowObservability {
  recordMetrics(instanceId: string, metricName: string, value: number, tags?: Record<string, string>): void;
  getMetrics(criteria?: Record<string, any>): Promise<any>;
  resetMetrics(): void;
}
