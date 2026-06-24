import { EventEmitter } from "events";

export class StateManager extends EventEmitter {
  private state = new Map<string, any>();

  constructor() {
    super();
    this.state.set("system.bootTime", new Date());
    this.state.set("system.activeConnections", 0);
    this.state.set("system.processedJobsTotal", 0);
    this.state.set("system.failedJobsTotal", 0);
    this.state.set("system.concurrencyLevel", 0);
  }

  public get<T>(key: string, defaultValue?: T): T {
    const val = this.state.get(key);
    return val !== undefined ? val : (defaultValue as T);
  }

  public set(key: string, value: any): void {
    const previous = this.state.get(key);
    if (previous === value) {
      return;
    }

    this.state.set(key, value);
    this.emit("change", { key, previous, current: value });
    this.emit(`change:${key}`, { previous, current: value });
  }

  public update(key: string, updater: (current: any) => any): void {
    const current = this.state.get(key);
    const updated = updater(current);
    this.set(key, updated);
  }

  public increment(key: string, amount = 1): void {
    this.update(key, (curr) => {
      const num = Number(curr) || 0;
      return num + amount;
    });
  }

  public decrement(key: string, amount = 1): void {
    this.update(key, (curr) => {
      const num = Number(curr) || 0;
      return num - amount;
    });
  }

  public getSnapshot(): Record<string, any> {
    const snapshot: Record<string, any> = {};
    for (const [k, v] of this.state.entries()) {
      snapshot[k] = v;
    }
    return snapshot;
  }

  public reset(): void {
    this.state.clear();
    this.state.set("system.bootTime", new Date());
  }
}
