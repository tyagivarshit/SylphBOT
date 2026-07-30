export interface IVectorProvider {
  searchVectors(collection: string, vector: number[], limit?: number): Promise<any[]>;
  storeVectors(collection: string, points: any[]): Promise<void>;
}

export interface ICacheProvider {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

export interface IQueueProvider {
  enqueue(queueName: string, payload: any): Promise<void>;
}

export interface IStorageProvider {
  upload(bucket: string, key: string, buffer: Buffer): Promise<string>;
  download(bucket: string, key: string): Promise<Buffer>;
}

export interface IEmbeddingProvider {
  generateEmbedding(text: string): Promise<number[]>;
}

export interface ILLMProvider {
  generateCompletion(prompt: string, options?: any): Promise<string>;
}

export interface IClockProvider {
  now(): Date;
}

export interface ILoggerProvider {
  log(level: string, message: string, context?: Record<string, any>): void;
}

export interface ITracingProvider {
  startSpan(name: string): any;
  endSpan(span: any): void;
}

export interface IMetricsProvider {
  increment(metric: string, value?: number): void;
}

export interface IIdGeneratorProvider {
  generateId(prefix?: string): string;
}
