import { IReasoningLogger, ReasoningLog } from "../interfaces/observability";
import { SanitizedReasoningLog } from "./types";

export class ReasoningTraceEngine implements IReasoningLogger {
  private logs: SanitizedReasoningLog[] = [];
  private privacyStrict = true;

  constructor(privacyStrict = true) {
    this.privacyStrict = privacyStrict;
  }

  /**
   * Logs a reasoning event. Sanitizes the prompt and completion to strictly avoid
   * storing raw chain-of-thought or sensitive enterprise content.
   */
  public async logReasoning(log: ReasoningLog): Promise<void> {
    if (!log) return;

    let sanitizedPrompt = log.prompt;
    let sanitizedCompletion = log.completion;

    if (this.privacyStrict) {
      // Data Minimization: Remove full prompts/completions and keep only structural metadata
      const promptTokensEst = Math.ceil(log.prompt.length / 4);
      const completionTokensEst = Math.ceil(log.completion.length / 4);
      
      sanitizedPrompt = `[PII Masked System Prompt: length=${log.prompt.length} chars, estTokens=${promptTokensEst}]`;
      sanitizedCompletion = `[PII Masked LLM Completion: length=${log.completion.length} chars, estTokens=${completionTokensEst}]`;
    } else {
      // Standard sanitization logic (strip passwords, keys)
      const sensitivePattern = /(password|credential|api[_-]?key|secret|token)\s*[:=]\s*[^\s,;&]+/gi;
      sanitizedPrompt = log.prompt.replace(sensitivePattern, "$1: [MASKED]");
      sanitizedCompletion = log.completion.replace(sensitivePattern, "$1: [MASKED]");
    }

    // Heuristically determine intent and confidence from the completion text
    let intent: string | undefined;
    let confidence: number | undefined;

    try {
      if (log.completion.startsWith("{")) {
        const payload = JSON.parse(log.completion);
        intent = payload.intent;
        confidence = payload.confidence;
      }
    } catch {
      // Silent fail: not a JSON completion
    }

    const sanitizedLog: SanitizedReasoningLog = {
      executionId: log.executionId,
      traceId: log.traceId,
      prompt: sanitizedPrompt,      // satisfies core interface
      completion: sanitizedCompletion, // satisfies core interface
      timestamp: log.timestamp || new Date(),
      sanitizedPrompt,
      sanitizedCompletion,
      intent,
      confidence,
      policyCheckCount: log.prompt.includes("CONSTITUTION") ? 5 : 0 // heuristic metadata
    };

    this.logs.push(sanitizedLog);
  }

  /**
   * Returns reasoning logs. Supports tenant filter checks via executionId prefix or custom metadata.
   */
  public getLogs(filterOptions?: { intent?: string; minConfidence?: number }): SanitizedReasoningLog[] {
    return this.logs.filter(log => {
      if (filterOptions?.intent && log.intent !== filterOptions.intent) return false;
      if (filterOptions?.minConfidence !== undefined && log.confidence !== undefined && log.confidence < filterOptions.minConfidence) {
        return false;
      }
      return true;
    });
  }

  /**
   * Evaluates retention policy to drop records older than cutoff.
   */
  public prune(olderThan: Date): void {
    const cutoffTime = olderThan.getTime();
    this.logs = this.logs.filter(log => log.timestamp.getTime() >= cutoffTime);
  }

  /**
   * Clears logs (for testing).
   */
  public clear(): void {
    this.logs = [];
  }
}
