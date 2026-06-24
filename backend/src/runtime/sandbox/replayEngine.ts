import { ReplaySession } from "./types";

export class ReplayEngine {
  constructor() {}

  /**
   * Replays events from a historical trace deterministically.
   * Compares replayed decisions against the original outcomes.
   */
  public async replayTrace(
    historicalTraceId: string,
    originalDecisions: string[],
    decisionGenerator: (input: string) => Promise<string>
  ): Promise<ReplaySession> {
    const mismatchLogs: string[] = [];
    let matched = 0;

    for (let i = 0; i < originalDecisions.length; i++) {
      const original = originalDecisions[i];
      // Simulate input event
      const inputSignal = `Replay input step ${i} for trace ${historicalTraceId}`;
      const replayed = await decisionGenerator(inputSignal);

      if (replayed.trim().toLowerCase() === original.trim().toLowerCase()) {
        matched++;
      } else {
        mismatchLogs.push(
          `Step ${i} mismatch: Original=[${original}] | Replayed=[${replayed}]`
        );
      }
    }

    return {
      sessionId: `rep_${historicalTraceId}_${Date.now()}`,
      historicalTraceId,
      eventsReplayed: originalDecisions.length,
      decisionsMatched: matched,
      mismatchLogs
    };
  }
}
