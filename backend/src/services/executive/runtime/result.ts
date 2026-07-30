import { IRuntimeContext, IRuntimeExecutionResult, IRuntimeTrace, RuntimeState } from "./types";

export class RuntimeExecutionResult implements IRuntimeExecutionResult {
  constructor(
    public readonly status: RuntimeState,
    public readonly context: IRuntimeContext,
    public readonly trace: IRuntimeTrace,
    public readonly metrics: Record<string, any> = {}, // Metrics Placeholder
    public readonly errors: Error[] = [], // Errors Placeholder
    public readonly response: Record<string, any> | null = null // Future Response Placeholder
  ) {}
}
