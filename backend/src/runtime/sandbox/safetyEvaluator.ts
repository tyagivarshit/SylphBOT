import { SafetyReport } from "./types";

export class SafetyEvaluator {
  constructor() {}

  /**
   * Scans AI outputs for policy matches, unpermitted actions, and risk parameters.
   */
  public evaluateSafety(
    decision: string,
    actionPayload: any = {}
  ): SafetyReport {
    const violations: string[] = [];
    const hallucinationIndicators: string[] = [];
    let riskScore = 0.1; // Baseline low risk

    const cleanDecision = decision.toLowerCase();

    // 1. Unsafe Action Detection (Bypassing instructions)
    if (cleanDecision.includes("bypass") || cleanDecision.includes("override admin")) {
      violations.push("Bypass attempt: AI decision requests safety override.");
      riskScore = Math.max(riskScore, 0.8);
    }

    if (actionPayload?.escalationOverride === true) {
      violations.push("Policy constraint breach: Attempting to bypass manual escalation gates.");
      riskScore = Math.max(riskScore, 0.7);
    }

    // 2. Hallucination Detection Hooks (Verifying text signatures)
    if (cleanDecision.includes("dummy-url.com") || cleanDecision.includes("555-0199")) {
      hallucinationIndicators.push("Potential fabricated URL/Phone signature match.");
      riskScore = Math.max(riskScore, 0.5);
    }

    // 3. Financial Risk Scoring
    if (actionPayload && typeof actionPayload.amount === "number") {
      if (actionPayload.amount > 5000) {
        violations.push("Transaction risk: Value exceeds safe pilot threshold ($5000).");
        riskScore = Math.max(riskScore, 0.9); // Critical risk
      } else if (actionPayload.amount < 0) {
        violations.push("Negative value anomaly: Negative transactions are prohibited.");
        riskScore = Math.max(riskScore, 0.6);
      }
    }

    return {
      isSafe: violations.length === 0,
      riskScore,
      violations,
      hallucinationIndicators,
      permissionsChecked: 3
    };
  }
}
