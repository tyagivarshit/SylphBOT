import { TimelineMessage, MemoryFact } from "./memory";

export interface ContextPayload {
  businessName: string;
  businessInfo: string;
  pricingInfo: string;
  faqKnowledge: string;
  knowledgeHits: string[];
  timeline: TimelineMessage[];
  facts: MemoryFact[];
}

export interface IContextOrchestrator {
  assembleContext(
    businessId: string,
    leadId: string,
    query: string
  ): Promise<ContextPayload>;
}

export interface IPromptCompiler {
  compilePrompt(
    template: string,
    context: Record<string, unknown>
  ): string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  execute: (context: any, input: any) => Promise<any>;
}

export interface IToolRegistry {
  registerTool(tool: ToolDefinition): void;
  getTool(name: string): ToolDefinition | null;
  listTools(): ToolDefinition[];
}

export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  output?: any;
  error?: string;
}

export interface IToolExecutor {
  executeTool(name: string, args: Record<string, unknown>, context: any): Promise<ToolExecutionResult>;
  executeBatch(
    tools: Array<{ name: string; args: Record<string, unknown> }>,
    context: any
  ): Promise<ToolExecutionResult[]>;
}

export interface ScheduledJob {
  id: string;
  jobType: string;
  payload: Record<string, unknown>;
  runAt: Date;
}

export interface IScheduler {
  scheduleJob(job: Omit<ScheduledJob, "id">): Promise<string>;
  cancelJob(id: string): Promise<void>;
}

export type EventCallback<T = any> = (event: T) => void | Promise<void>;

export interface IEventBus {
  publish(topic: string, payload: Record<string, unknown>): Promise<void>;
  subscribe(topic: string, callback: EventCallback): void;
}
