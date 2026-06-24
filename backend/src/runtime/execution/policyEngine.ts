import { ExecutionContext, PolicyRule } from "./types";

export class PolicyEngine {
  private rules = new Map<string, PolicyRule>();

  constructor() {
    // Add a default business-agnostic compliance rule: Payload Size Limit
    this.registerRule({
      id: "max_payload_size",
      name: "Enforce safe parameter payload limits",
      evaluator: (context, input) => {
        const payloadStr = JSON.stringify(input || {});
        // Heuristic: limit payloads to 100kb character length for safety
        if (payloadStr.length > 100000) {
          return {
            allowed: false,
            escalationRequired: true,
            reason: "Payload size exceeds execution policy constraints."
          };
        }
        return { allowed: true, escalationRequired: false };
      }
    });
  }

  /**
   * Registers a policy rule dynamically.
   */
  public registerRule(rule: PolicyRule): void {
    if (this.rules.has(rule.id)) {
      throw new Error(`Policy rule with ID [${rule.id}] is already registered.`);
    }
    this.rules.set(rule.id, rule);
  }

  /**
   * Evaluates all active policy rules.
   */
  public evaluate(
    context: ExecutionContext,
    input: any
  ): { allowed: boolean; escalationRequired: boolean; reasons: string[] } {
    const reasons: string[] = [];
    let isAllowed = true;
    let isEscalationRequired = false;

    for (const rule of this.rules.values()) {
      const outcome = rule.evaluator(context, input);
      if (!outcome.allowed) {
        isAllowed = false;
        if (outcome.reason) {
          reasons.push(`${rule.name}: ${outcome.reason}`);
        }
        if (outcome.escalationRequired) {
          isEscalationRequired = true;
        }
      }
    }

    return {
      allowed: isAllowed,
      escalationRequired: isEscalationRequired,
      reasons
    };
  }

  /**
   * Removes a policy rule by id.
   */
  public removeRule(id: string): void {
    this.rules.delete(id);
  }

  /**
   * Clears all registered custom policy rules.
   */
  public clear(): void {
    this.rules.clear();
  }
}
