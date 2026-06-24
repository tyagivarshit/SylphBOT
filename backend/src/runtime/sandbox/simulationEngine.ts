import { ISimulationEngine, SimulationReport } from "../interfaces/sandbox";

export class SimulationEngine implements ISimulationEngine {
  private failureSimulationMode = false;

  constructor() {}

  /**
   * Toggles failure simulation to test system fault tolerance and safety behaviors.
   */
  public setFailureSimulation(enabled: boolean): void {
    this.failureSimulationMode = enabled;
  }

  /**
   * Simulates decision outcomes and execution pathways for historical leads.
   */
  public async runSimulation(
    businessId: string,
    historicalLeadIds: string[],
    variantId: string
  ): Promise<SimulationReport> {
    if (historicalLeadIds.length === 0) {
      return { accuracyRate: 1.0, averageLatencyMs: 0, variantHits: 0 };
    }

    let successes = 0;
    let totalLatency = 0;

    for (const leadId of historicalLeadIds) {
      // Simulate execution step
      const start = Date.now();
      
      // Artificial execution latency simulation
      await this.sleep(10);
      
      const latency = Date.now() - start;
      totalLatency += latency;

      // Determine simulated outcome
      if (this.failureSimulationMode || variantId === "tripped_variant") {
        // Simulated failure case
        successes += 0;
      } else {
        successes += 1;
      }
    }

    const accuracyRate = successes / historicalLeadIds.length;
    const averageLatencyMs = totalLatency / historicalLeadIds.length;

    return {
      accuracyRate,
      averageLatencyMs,
      variantHits: historicalLeadIds.length
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
