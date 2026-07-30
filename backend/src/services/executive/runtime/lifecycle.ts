import { RuntimeState } from "./types";

export class RuntimeLifecycle {
  private state: RuntimeState = "INITIALIZING";
  private stateHistory: Array<{ state: RuntimeState; timestamp: Date; reason?: string }> = [];

  constructor() {
    this.recordState("INITIALIZING", "Lifecycle created");
  }

  public getState(): RuntimeState {
    return this.state;
  }

  public getHistory(): Array<{ state: RuntimeState; timestamp: Date; reason?: string }> {
    return [...this.stateHistory];
  }

  private recordState(targetState: RuntimeState, reason?: string): void {
    this.state = targetState;
    this.stateHistory.push({
      state: targetState,
      timestamp: new Date(),
      reason,
    });
  }

  public initialize(reason?: string): void {
    this.validateTransition("INITIALIZING");
    this.recordState("INITIALIZING", reason || "Initializing runtime parameters");
  }

  public startBuildingContext(reason?: string): void {
    this.validateTransition("BUILDING_CONTEXT");
    this.recordState("BUILDING_CONTEXT", reason || "Building dynamic context packages");
  }

  public setReady(reason?: string): void {
    this.validateTransition("READY");
    this.recordState("READY", reason || "Context complete and ready for execution");
  }

  public start(reason?: string): void {
    this.validateTransition("RUNNING");
    this.recordState("RUNNING", reason || "Executing active pipeline steps");
  }

  public complete(reason?: string): void {
    this.validateTransition("COMPLETED");
    this.recordState("COMPLETED", reason || "Runtime execution finished successfully");
  }

  public fail(error: Error, reason?: string): void {
    this.validateTransition("FAILED");
    this.recordState("FAILED", `${reason || "Execution failed"}: ${error.message}`);
  }

  public recover(reason?: string): void {
    this.validateTransition("RECOVERING");
    this.recordState("RECOVERING", reason || "Attempting failover/recovery routines");
  }

  public cancel(reason?: string): void {
    this.validateTransition("CANCELLED");
    this.recordState("CANCELLED", reason || "Execution cancelled by operator or client abort");
  }

  public dispose(reason?: string): void {
    this.recordState("INITIALIZING", reason || "Disposing current request context scope");
  }

  /**
   * Helper to ensure correct state transitions are followed.
   */
  private validateTransition(target: RuntimeState): void {
    const current = this.state;

    if (current === "COMPLETED" || current === "CANCELLED") {
      throw new Error(`Invalid transition: Cannot transition from terminal state [${current}] to [${target}].`);
    }

    if (target === "INITIALIZING" && current !== "INITIALIZING") {
      throw new Error(`Invalid transition: Cannot reinitialize after boot (current: [${current}]).`);
    }

    if (target === "READY" && current !== "BUILDING_CONTEXT" && current !== "RECOVERING") {
      throw new Error(`Invalid transition: Context must be built or recovered before setting to ready (current: [${current}]).`);
    }

    if (target === "RUNNING" && current !== "READY" && current !== "RECOVERING") {
      throw new Error(`Invalid transition: Must be ready or recovering before starting execution (current: [${current}]).`);
    }
  }
}
