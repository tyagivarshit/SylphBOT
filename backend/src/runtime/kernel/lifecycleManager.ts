export type LifecycleState =
  | "Initialize"
  | "Start"
  | "Ready"
  | "Paused"
  | "Stopping"
  | "Stopped"
  | "Failed"
  | "Restarting";

export interface LifecycleHook {
  name: string;
  onInitialize?: () => Promise<void> | void;
  onStart?: () => Promise<void> | void;
  onStop?: () => Promise<void> | void;
  onPause?: () => Promise<void> | void;
  onResume?: () => Promise<void> | void;
}

export class LifecycleManager {
  private currentState: LifecycleState = "Stopped";
  private hooks: LifecycleHook[] = [];
  private stateChangeCallbacks: Array<(state: LifecycleState) => void> = [];

  public getState(): LifecycleState {
    return this.currentState;
  }

  public registerHook(hook: LifecycleHook): void {
    if (this.hooks.some(h => h.name === hook.name)) {
      throw new Error(`Lifecycle hook [${hook.name}] is already registered.`);
    }
    this.hooks.push(hook);
  }

  public onStateChange(callback: (state: LifecycleState) => void): void {
    this.stateChangeCallbacks.push(callback);
  }

  public async transitionTo(targetState: LifecycleState): Promise<void> {
    const originalState = this.currentState;
    if (originalState === targetState) {
      return;
    }

    this.validateTransition(originalState, targetState);
    this.currentState = targetState;

    try {
      await this.executeHooksForState(targetState);
      this.notifyStateChange(targetState);
    } catch (error) {
      console.error(`Lifecycle transition from [${originalState}] to [${targetState}] failed:`, error);
      this.currentState = "Failed";
      this.notifyStateChange("Failed");
      throw error;
    }
  }

  private validateTransition(from: LifecycleState, to: LifecycleState): void {
    const validTransitions: Record<LifecycleState, LifecycleState[]> = {
      Stopped: ["Initialize", "Failed"],
      Initialize: ["Start", "Failed", "Stopping"],
      Start: ["Ready", "Failed", "Stopping"],
      Ready: ["Paused", "Stopping", "Failed", "Restarting"],
      Paused: ["Ready", "Stopping", "Failed"],
      Stopping: ["Stopped", "Failed"],
      Restarting: ["Initialize", "Failed"],
      Failed: ["Restarting", "Stopping", "Stopped"]
    };

    const allowed = validTransitions[from] || [];
    if (!allowed.includes(to)) {
      throw new Error(`Invalid lifecycle state transition from [${from}] to [${to}]`);
    }
  }

  private async executeHooksForState(state: LifecycleState): Promise<void> {
    for (const hook of this.hooks) {
      try {
        switch (state) {
          case "Initialize":
            if (hook.onInitialize) await hook.onInitialize();
            break;
          case "Start":
            if (hook.onStart) await hook.onStart();
            break;
          case "Stopping":
            if (hook.onStop) await hook.onStop();
            break;
          case "Paused":
            if (hook.onPause) await hook.onPause();
            break;
          case "Ready":
            if (hook.onResume) await hook.onResume();
            break;
          default:
            break;
        }
      } catch (err) {
        console.error(`Error in hook [${hook.name}] during [${state}] transition:`, err);
        throw err;
      }
    }
  }

  private notifyStateChange(state: LifecycleState): void {
    for (const cb of this.stateChangeCallbacks) {
      try {
        cb(state);
      } catch (err) {
        console.error("Error in lifecycle state change observer:", err);
      }
    }
  }

  public reset(): void {
    this.hooks = [];
    this.stateChangeCallbacks = [];
    this.currentState = "Stopped";
  }
}
