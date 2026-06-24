export interface OptimizationEntry {
  businessId: string;
  promptTemplateId: string;
  variantKey: string;
  conversionMetrics: {
    clicks: number;
    responses: number;
    revenue: number;
  };
}

export interface ILearningRegistry {
  registerOptimization(entry: OptimizationEntry): Promise<void>;
  getOptimizedVariant(businessId: string, promptTemplateId: string): Promise<string | null>;
}

export interface ClassificationResult {
  intent: string;
  confidence: number;
  category: string;
  spamScore: number;
}

export interface IClassifierRouter {
  classifyMessage(
    businessId: string,
    message: string
  ): Promise<ClassificationResult>;
}
