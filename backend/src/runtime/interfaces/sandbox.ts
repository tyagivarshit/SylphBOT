import { MessageDTO, CompletionResult } from "./core";

export interface ISandboxManager {
  executeInSandbox<T>(
    task: () => Promise<T>
  ): Promise<T>;
}

export interface IShadowModeManager {
  runShadowCompletion(
    businessId: string,
    messages: MessageDTO[],
    activeResult: CompletionResult
  ): Promise<void>;
}

export interface SimulationReport {
  accuracyRate: number;
  averageLatencyMs: number;
  variantHits: number;
}

export interface ISimulationEngine {
  runSimulation(
    businessId: string,
    historicalLeadIds: string[],
    variantId: string
  ): Promise<SimulationReport>;
}
