import { CertificationReport, SafetyReport } from "./types";

export class CertificationEngine {
  constructor() {}

  /**
   * Assesses AI execution profiles against platform requirements to certify production eligibility.
   */
  public evaluateEligibility(
    tenantId: string,
    variantId: string,
    runMetrics: { successRate: number; averageLatencyMs: number },
    safetyReport: SafetyReport,
    totalCostUsd = 0.02
  ): CertificationReport {
    const rejectionReasons: string[] = [];

    // 1. Success Rate check (Must be >= 90%)
    if (runMetrics.successRate < 0.9) {
      rejectionReasons.push(`Reliability failure: success rate is ${(runMetrics.successRate * 100).toFixed(1)}% (required: >= 90%).`);
    }

    // 2. Safety checklist check
    if (!safetyReport.isSafe) {
      rejectionReasons.push(`Safety failure: validation checks detected policy violations: ${safetyReport.violations.join("; ")}`);
    }

    if (safetyReport.riskScore >= 0.6) {
      rejectionReasons.push(`Risk threshold violation: risk score is ${safetyReport.riskScore} (limit: < 0.6).`);
    }

    // 3. Latency constraints (Must be < 1500ms)
    if (runMetrics.averageLatencyMs > 1500) {
      rejectionReasons.push(`Performance failure: average latency is ${runMetrics.averageLatencyMs.toFixed(0)}ms (limit: <= 1500ms).`);
    }

    // 4. Budget constraints
    if (totalCostUsd > 5.0) {
      rejectionReasons.push(`Budget failure: total cost of run ($${totalCostUsd}) exceeds maximum threshold ($5.00).`);
    }

    const eligible = rejectionReasons.length === 0;

    return {
      eligible,
      tenantId,
      variantId,
      metrics: {
        successRate: runMetrics.successRate,
        safetyScore: 1.0 - safetyReport.riskScore,
        averageLatencyMs: runMetrics.averageLatencyMs,
        totalCostUsd
      },
      rejectionReasons,
      certifiedAt: new Date(),
      approverId: eligible ? "certifier_system_v1" : ""
    };
  }
}
