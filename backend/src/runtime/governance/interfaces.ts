import { OigSecurityContext } from "../oig/interfaces";

export type PluginLifecycleState =
  | "Installed"
  | "Validated"
  | "Loaded"
  | "Initializing"
  | "Running"
  | "Paused"
  | "Updating"
  | "Migrating"
  | "Deprecated"
  | "Retired"
  | "Failed";

export interface PluginLifecycleEvent {
  pluginId: string;
  oldState: PluginLifecycleState;
  newState: PluginLifecycleState;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface GovernancePolicy {
  id: string;
  name: string;
  type: "Rule" | "HealthGate" | "MigrationRule" | "FreezeRule" | "CompatibilityRule";
  evaluate: (ctx: OigSecurityContext, input: any) => { allowed: boolean; reason?: string };
}

export interface DecisionMetadata {
  decisionId: string;
  timestamp: Date;
  tenantId: string;
  evidenceReferences?: string[];
  sourceReferences?: string[];
  policyReferences?: string[];
  capabilityReferences?: string[];
  workflowReferences?: string[];
  confidenceScore?: number;
  executionTrace?: string[];
  validationResults?: any;
  approvalReferences?: string[];
  auditMetadata?: Record<string, any>;
}

export interface ISemanticResolutionLayer {
  resolveAlias(tenantId: string, aliasId: string): string;
  resolveEquivalentEntities(tenantId: string, entityId: string): string[];
  resolveRelationshipExpansion(tenantId: string, nodeId: string, predicate: string): string[];
  resolveTypeResolution(tenantId: string, nodeId: string): string;
  resolveOntologyRelation(tenantId: string, sourceId: string, targetId: string, predicate: string): boolean;
  enrichMetadata(tenantId: string, nodeId: string, metadata: Record<string, any>): void;
}

export interface IRuntimeGovernanceEngine {
  // Plugin Lifecycle Manager
  getPluginState(pluginId: string): PluginLifecycleState;
  transitionPlugin(pluginId: string, targetState: PluginLifecycleState, ctx?: OigSecurityContext): Promise<void>;
  
  // Runtime Governance
  registerPolicy(policy: GovernancePolicy): void;
  evaluatePolicy(policyId: string, ctx: OigSecurityContext, input: any): { allowed: boolean; reason?: string };
  isRuntimeFrozen(tenantId: string): boolean;
  setRuntimeFreeze(tenantId: string, freeze: boolean, ctx: OigSecurityContext): void;
}
