export class ResourceScheduler {
  private activeCount = 0;
  private maxConcurrency = 10;
  private tenantActiveCount = new Map<string, number>();
  private tenantMaxConcurrency = 3; // Ensure tenant fairness limit
  
  // Structured queue array partitioned by priority
  private queues = {
    high: [] as Array<{ tenantId: string; task: () => Promise<any>; resolve: (v: any) => void; reject: (e: any) => void }>,
    medium: [] as Array<{ tenantId: string; task: () => Promise<any>; resolve: (v: any) => void; reject: (e: any) => void }>,
    low: [] as Array<{ tenantId: string; task: () => Promise<any>; resolve: (v: any) => void; reject: (e: any) => void }>
  };

  constructor(maxConcurrency = 10, tenantMaxConcurrency = 3) {
    this.maxConcurrency = maxConcurrency;
    this.tenantMaxConcurrency = tenantMaxConcurrency;
  }

  /**
   * Enqueues a task and schedules its execution based on priority, worker pool limits, and tenant limits.
   */
  public enqueue<T>(
    tenantId: string,
    priority: "high" | "medium" | "low",
    task: () => Promise<T>
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queues[priority].push({ tenantId, task, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Evaluates queue state and launches the highest priority task that satisfies limits.
   */
  private processQueue(): void {
    if (this.activeCount >= this.maxConcurrency) {
      return; // Workers pool is fully saturated
    }

    const priorities: Array<"high" | "medium" | "low"> = ["high", "medium", "low"];

    for (const priority of priorities) {
      const queue = this.queues[priority];
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        const tenantActive = this.tenantActiveCount.get(item.tenantId) || 0;

        // Tenant Fairness check: Skip task if tenant is already utilizing their share of slots
        if (tenantActive >= this.tenantMaxConcurrency) {
          continue; 
        }

        // Dequeue item
        queue.splice(i, 1);
        
        // Execute task
        this.runTask(item.tenantId, item.task, item.resolve, item.reject);
        
        // Recurse to see if we can fill more slots
        this.processQueue();
        return;
      }
    }
  }

  private async runTask(
    tenantId: string,
    task: () => Promise<any>,
    resolve: (v: any) => void,
    reject: (e: any) => void
  ): Promise<void> {
    this.activeCount++;
    this.tenantActiveCount.set(tenantId, (this.tenantActiveCount.get(tenantId) || 0) + 1);

    try {
      const result = await task();
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      this.activeCount--;
      const current = this.tenantActiveCount.get(tenantId) || 1;
      this.tenantActiveCount.set(tenantId, current - 1);
      
      // Process queue to trigger next task in line
      this.processQueue();
    }
  }

  /**
   * Resets active locks (useful for testing).
   */
  public reset(): void {
    this.activeCount = 0;
    this.tenantActiveCount.clear();
    this.queues.high = [];
    this.queues.medium = [];
    this.queues.low = [];
  }
}
