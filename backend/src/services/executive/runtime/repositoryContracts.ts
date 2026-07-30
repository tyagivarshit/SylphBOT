export interface IBusinessContextRepository {
  loadBusinessProfile(tenantId: string): Promise<any>;
  loadLatestSubscription(tenantId: string): Promise<any>;
}

export interface IKnowledgeProvider {
  loadKnowledgeForRuntime(tenantId: string, query: string, options?: any): Promise<any[]>;
}

export interface IMemoryProvider {
  loadMemoryForConversation(tenantId: string, executiveId: string, query: string, options?: any): Promise<any[]>;
  storeExecutionTrace(tenantId: string, executiveId: string, memory: any): Promise<void>;
}

export interface IKnowledgeRepository {
  loadKnowledgeForRuntime(tenantId: string, query: string, options?: any): Promise<any[]>;
}

export interface IMemoryRepository {
  loadMemoryForConversation(tenantId: string, executiveId: string, query: string, options?: any): Promise<any[]>;
  storeExecutionTrace(tenantId: string, executiveId: string, memory: any): Promise<void>;
}
