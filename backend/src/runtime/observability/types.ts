import { TracingSpan, ReasoningLog } from "../interfaces/observability";

export interface SanitizedReasoningLog extends ReasoningLog {
  sanitizedPrompt: string;
  sanitizedCompletion: string;
  intent?: string;
  confidence?: number;
  policyCheckCount?: number;
  metadata?: Record<string, any>;
}

export interface MetricEntry {
  name: string;
  value: number;
  timestamp: Date;
  tags: Record<string, string>;
}

export interface EventEntry {
  name: string;
  timestamp: Date;
  payload: Record<string, any>;
}

export interface AuditRecord {
  id: string;
  tenantId: string;
  userId: string;
  action: string;
  timestamp: Date;
  details: Record<string, any>;
  version: string;
}

export interface CostEntry {
  id: string;
  tenantId: string;
  type: "llm" | "tool" | "infrastructure";
  modelName?: string;
  toolName?: string;
  costInUsd: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AlertRule {
  id: string;
  metricName: string;
  threshold: number;
  operator: "gt" | "lt" | "eq";
  severity: "info" | "warning" | "critical";
  escalationPath: string[];
}

export interface AlertRecord {
  id: string;
  ruleId: string;
  tenantId: string;
  severity: "info" | "warning" | "critical";
  message: string;
  timestamp: Date;
  resolved: boolean;
}

export interface SystemHealthStatus {
  health: "Healthy" | "Degraded" | "Failed";
  readiness: "Ready" | "Not Ready";
  liveness: "Alive" | "Dead";
  timestamp: Date;
  components: Record<string, { health: string; message: string }>;
}
