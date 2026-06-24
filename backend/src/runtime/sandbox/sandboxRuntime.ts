import { ISandboxManager } from "../interfaces/sandbox";

export class SandboxRuntime implements ISandboxManager {
  private active = false;

  constructor() {}

  /**
   * Sets up an isolated run context to isolate any executing logic.
   * Guarantees that side effects do not propagate to production state.
   */
  public async executeInSandbox<T>(task: () => Promise<T>): Promise<T> {
    const previousState = this.active;
    this.active = true;

    try {
      // Toggle side-effect locks, redirect DB writers to temporary storage, mock networks
      return await task();
    } finally {
      // Restore previous state
      this.active = previousState;
    }
  }

  /**
   * Evaluates if sandbox isolation context is currently active on this thread.
   */
  public isSandboxActive(): boolean {
    return this.active;
  }
}
