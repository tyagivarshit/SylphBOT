export interface CircuitBreakerSettings {
  failureThreshold: number; // Max failures before trip
  cooldownPeriodMs: number; // Time in OPEN state before trying HALF_OPEN
  halfOpenSuccessLimit: number; // Successes required to restore to CLOSED
}

interface ToolCircuitState {
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failures: number;
  successes: number;
  lastStateChange: number;
}

export class CircuitBreakerEngine {
  private settings: CircuitBreakerSettings;
  private states = new Map<string, ToolCircuitState>();

  constructor(settings?: Partial<CircuitBreakerSettings>) {
    this.settings = {
      failureThreshold: settings?.failureThreshold ?? 3,
      cooldownPeriodMs: settings?.cooldownPeriodMs ?? 5000, // 5s recovery window
      halfOpenSuccessLimit: settings?.halfOpenSuccessLimit ?? 2
    };
  }

  /**
   * Evaluates if a tool execution can proceed.
   * Handles auto-recovery window check for tripped circuits.
   */
  public canExecute(toolName: string): boolean {
    const state = this.getOrCreateState(toolName);

    if (state.state === "CLOSED") {
      return true;
    }

    if (state.state === "OPEN") {
      const now = Date.now();
      const elapsed = now - state.lastStateChange;
      
      if (elapsed >= this.settings.cooldownPeriodMs) {
        // Recovery window elapsed, move to HALF_OPEN to attempt recovery
        state.state = "HALF_OPEN";
        state.successes = 0;
        state.lastStateChange = now;
        this.states.set(toolName, state);
        return true;
      }
      return false;
    }

    // HALF_OPEN allows tests to pass through
    return true;
  }

  /**
   * Registers a successful execution, recovering the state from HALF_OPEN if threshold is met.
   */
  public recordSuccess(toolName: string): void {
    const state = this.getOrCreateState(toolName);
    state.failures = 0; // Reset failures

    if (state.state === "HALF_OPEN") {
      state.successes++;
      if (state.successes >= this.settings.halfOpenSuccessLimit) {
        state.state = "CLOSED";
        state.successes = 0;
        state.lastStateChange = Date.now();
      }
    }
    this.states.set(toolName, state);
  }

  /**
   * Registers a failure. Trips the circuit if threshold is breached.
   */
  public recordFailure(toolName: string): void {
    const state = this.getOrCreateState(toolName);
    state.failures++;

    if (state.state === "CLOSED" && state.failures >= this.settings.failureThreshold) {
      state.state = "OPEN";
      state.lastStateChange = Date.now();
    } else if (state.state === "HALF_OPEN") {
      // Tripping back immediately on any half-open failure
      state.state = "OPEN";
      state.lastStateChange = Date.now();
    }
    
    this.states.set(toolName, state);
  }

  /**
   * Gets active circuit state.
   */
  public getState(toolName: string): "CLOSED" | "OPEN" | "HALF_OPEN" {
    return this.getOrCreateState(toolName).state;
  }

  private getOrCreateState(toolName: string): ToolCircuitState {
    let state = this.states.get(toolName);
    if (!state) {
      state = {
        state: "CLOSED",
        failures: 0,
        successes: 0,
        lastStateChange: Date.now()
      };
      this.states.set(toolName, state);
    }
    return state;
  }
}
