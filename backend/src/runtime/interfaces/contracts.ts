export interface AgentCapability {
  agentId: string;
  intents: string[];
  platforms: string[];
  supportedCtas: string[];
  responseFormatSchema: Record<string, unknown>;
}

export interface ICapabilityRegistry {
  registerAgentCapabilities(capabilities: AgentCapability): Promise<void>;
  getAgentForIntent(intent: string): Promise<string | null>;
  getAgentCapabilities(agentId: string): Promise<AgentCapability | null>;
  unregisterCapability(name: string, version: string): void;
  unregisterAgentCapabilities(agentId: string): void;
  destroy(): void;
}

export interface IContractRegistry {
  registerSchema(name: string, schema: Record<string, unknown>): void;
  getSchema(name: string): Record<string, unknown> | null;
  validatePayload(name: string, payload: unknown): { isValid: boolean; errors: string[] };
  unregisterContract(name: string, version: string): void;
  destroy(): void;
}
