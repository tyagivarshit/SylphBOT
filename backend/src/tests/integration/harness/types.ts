import type { PrismaClient } from "@prisma/client";

export type IntegrationTenantFixture = {
  userId: string;
  businessId: string;
  clientId: string;
  pageId: string;
  planId: string;
};

export type IntegrationWebhookMessageInput = {
  pageId: string;
  senderId: string;
  messageId: string;
  messageText: string;
  timestampMs?: number;
};

export type IntegrationHarness = {
  httpGet: (
    path: string,
    options?: {
      headers?: Record<string, string>;
    }
  ) => Promise<{
    statusCode: number;
    body: any;
    text: string;
  }>;
  httpPost: (
    path: string,
    body?: unknown,
    options?: {
      headers?: Record<string, string>;
      rawBody?: string;
    }
  ) => Promise<{
    statusCode: number;
    body: any;
    text: string;
  }>;
  prisma: PrismaClient;
  queuePrefix: string;
  webhookSecret: string;
  seedTenant: (input?: Partial<IntegrationTenantFixture>) => Promise<IntegrationTenantFixture>;
  postInstagramMessageWebhook: (
    input: IntegrationWebhookMessageInput
  ) => Promise<{
    statusCode: number;
    body: unknown;
  }>;
  withBypassHeaders: (
    input: {
      userId: string;
      businessId: string;
    }
  ) => Record<string, string>;
  cleanDatabase: () => Promise<void>;
  cleanQueueNamespace: () => Promise<void>;
  flushAll: () => Promise<void>;
  startReceptionWorkers: () => Promise<void>;
  stopReceptionWorkers: () => Promise<void>;
  waitFor: <T>(
    label: string,
    resolver: () => Promise<T | null>,
    options?: {
      timeoutMs?: number;
      intervalMs?: number;
    }
  ) => Promise<T>;
};

export type IntegrationSuite = {
  name: string;
  run: (harness: IntegrationHarness) => Promise<void>;
};
