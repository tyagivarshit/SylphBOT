import { ToolDefinition } from "../interfaces/execution";

export interface ExtendedToolDefinition extends ToolDefinition {
  version: string;
  permissions: string[]; // Permissions required to invoke this tool
  health: "Healthy" | "Degraded" | "Failed";
  capabilities: string[];
  ownerTenantId?: string; // If undefined, this is a system-wide tool
}

export interface ExecutionContext {
  tenantId: string;
  userId: string;
  requestId: string;
  roles: string[];
  correlationId: string;
}

export interface ExecutionRecord {
  executionId: string;
  correlationId: string;
  tenantId: string;
  toolName: string;
  status: "pending" | "running" | "completed" | "failed" | "retry_pending";
  startTime: Date;
  endTime?: Date;
  latencyMs?: number;
  input: any;
  output?: any;
  error?: string;
  retriesAttempted: number;
}

export interface ApprovalRequest {
  id: string;
  tenantId: string;
  executionId: string;
  status: "pending" | "approved" | "rejected";
  requesterId: string;
  approverId?: string;
  stepsRequired: number;
  stepsCompleted: number;
  auditTrail: string[];
  payload: any;
}

export interface PolicyRule {
  id: string;
  name: string;
  evaluator: (context: ExecutionContext, input: any) => { allowed: boolean; escalationRequired: boolean; reason?: string };
}
