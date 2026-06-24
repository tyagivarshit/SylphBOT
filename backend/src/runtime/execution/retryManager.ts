export interface RetrySettings {
  maxAttempts: number;
  initialDelayMs: number;
  factor: number;
}

export class RetryManager {
  private defaultSettings: RetrySettings = {
    maxAttempts: 3,
    initialDelayMs: 200,
    factor: 2
  };

  constructor(settings?: Partial<RetrySettings>) {
    if (settings) {
      this.defaultSettings = { ...this.defaultSettings, ...settings };
    }
  }

  /**
   * Runs an operation with retry capabilities, backoffs, and failure escalations.
   */
  public async executeWithRetry<T>(
    operation: (attempt: number) => Promise<T>,
    customSettings?: Partial<RetrySettings>,
    onRetryAttempt?: (attempt: number, error: any, nextDelayMs: number) => void
  ): Promise<T> {
    const config = { ...this.defaultSettings, ...customSettings };
    let attempt = 0;

    while (true) {
      try {
        attempt++;
        return await operation(attempt);
      } catch (err) {
        if (attempt >= config.maxAttempts) {
          // Failure escalation: throw out to trigger final fallback/alert hooks
          throw err;
        }

        // Calculate exponential backoff delay
        const nextDelayMs = config.initialDelayMs * Math.pow(config.factor, attempt - 1);
        
        if (onRetryAttempt) {
          onRetryAttempt(attempt, err, nextDelayMs);
        }

        // Wait before retrying
        await this.delay(nextDelayMs);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
