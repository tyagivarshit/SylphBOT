import assert from "node:assert/strict";
import prisma from "../config/prisma";
import { env } from "../config/env";
import * as telemetryModule from "../observability/performanceMetrics";
import { getMessages } from "../controllers/message.controller";
import { getMessagesByLead } from "../controllers/conversation.controller";

const createMockResponse = () => {
  const result: {
    statusCode: number;
    payload: any;
  } = {
    statusCode: 200,
    payload: null,
  };

  const res: any = {
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(data: any) {
      result.payload = data;
      return this;
    },
  };

  return { res, result };
};

export const messageReadCutoverATests = [
  {
    name: "read-cutover-a: feature flag disabled uses legacy emulated relation query",
    run: async () => {
      // 1. Force flag to false
      const originalFlag = env.MESSAGE_READ_CUTOVER_A_ENABLED;
      env.MESSAGE_READ_CUTOVER_A_ENABLED = false;
      const originalEnvVar = process.env.MESSAGE_READ_CUTOVER_A_ENABLED;
      process.env.MESSAGE_READ_CUTOVER_A_ENABLED = "false";

      // 2. Stub Prisma methods
      const originalLeadFindFirst = prisma.lead.findFirst;
      const originalMessageFindMany = prisma.message.findMany;
      const originalEmitPerformanceMetric = telemetryModule.emitPerformanceMetric;

      let capturedWhere: any = null;
      let telemetryCalls: any[] = [];

      (prisma.lead.findFirst as any) = async () => ({
        id: "lead_test_123",
        businessId: "business_test_123",
      });

      (prisma.message.findMany as any) = async (args: any) => {
        capturedWhere = args.where;
        return [];
      };

      (telemetryModule as any).emitPerformanceMetric = (input: any) => {
        telemetryCalls.push(input);
      };

      try {
        const mockReq: any = {
          user: { id: "user_test_123", businessId: "business_test_123" },
          params: { leadId: "lead_test_123" },
          query: {},
        };
        const { res, result } = createMockResponse();

        // Run message.controller: getMessages
        await getMessages(mockReq, res);

        assert.ok(capturedWhere, "Should execute prisma.message.findMany");
        assert.equal(capturedWhere.leadId, "lead_test_123");
        assert.ok(capturedWhere.lead, "Should contain nested lead check");
        assert.equal(capturedWhere.lead.businessId, "business_test_123");
        assert.equal(capturedWhere.lead.deletedAt, null);
        assert.equal(telemetryCalls.length, 0, "Should not emit telemetry on legacy path");

        // Reset for getMessagesByLead
        capturedWhere = null;

        // Run conversation.controller: getMessagesByLead
        await getMessagesByLead(mockReq, res);

        assert.ok(capturedWhere, "Should execute prisma.message.findMany");
        assert.equal(capturedWhere.leadId, "lead_test_123");
        assert.ok(capturedWhere.lead, "Should contain nested lead check");
        assert.equal(capturedWhere.lead.businessId, "business_test_123");
        assert.equal(capturedWhere.lead.deletedAt, null);
        assert.equal(telemetryCalls.length, 0, "Should not emit telemetry on legacy path");

      } finally {
        // Restore
        env.MESSAGE_READ_CUTOVER_A_ENABLED = originalFlag;
        process.env.MESSAGE_READ_CUTOVER_A_ENABLED = originalEnvVar;
        (prisma.lead.findFirst as any) = originalLeadFindFirst;
        (prisma.message.findMany as any) = originalMessageFindMany;
        (telemetryModule as any).emitPerformanceMetric = originalEmitPerformanceMetric;
      }
    },
  },
  {
    name: "read-cutover-a: feature flag enabled bypasses emulated relation and logs telemetry",
    run: async () => {
      // 1. Force flag to true
      const originalFlag = env.MESSAGE_READ_CUTOVER_A_ENABLED;
      env.MESSAGE_READ_CUTOVER_A_ENABLED = true;
      const originalEnvVar = process.env.MESSAGE_READ_CUTOVER_A_ENABLED;
      process.env.MESSAGE_READ_CUTOVER_A_ENABLED = "true";

      // 2. Stub Prisma methods
      const originalLeadFindFirst = prisma.lead.findFirst;
      const originalMessageFindMany = prisma.message.findMany;
      const originalEmitPerformanceMetric = telemetryModule.emitPerformanceMetric;

      let capturedWhere: any = null;
      let telemetryCalls: any[] = [];

      (prisma.lead.findFirst as any) = async () => ({
        id: "lead_test_123",
        businessId: "business_test_123",
      });

      (prisma.message.findMany as any) = async (args: any) => {
        capturedWhere = args.where;
        return [];
      };

      (telemetryModule as any).emitPerformanceMetric = (input: any) => {
        telemetryCalls.push(input);
      };

      try {
        const mockReq: any = {
          user: { id: "user_test_123", businessId: "business_test_123" },
          params: { leadId: "lead_test_123" },
          query: {},
        };
        const { res, result } = createMockResponse();

        // Run message.controller: getMessages
        await getMessages(mockReq, res);

        assert.ok(capturedWhere, "Should execute prisma.message.findMany");
        assert.equal(capturedWhere.leadId, "lead_test_123");
        assert.equal(capturedWhere.lead, undefined, "Should NOT contain nested lead check under Category A cutover");
        assert.equal(telemetryCalls.length, 1, "Should emit telemetry");
        assert.equal(telemetryCalls[0].name, "message_read_cutover_category_a");
        assert.equal(telemetryCalls[0].route, "getMessages");

        // Reset for getMessagesByLead
        capturedWhere = null;
        telemetryCalls = [];

        // Run conversation.controller: getMessagesByLead
        await getMessagesByLead(mockReq, res);

        assert.ok(capturedWhere, "Should execute prisma.message.findMany");
        assert.equal(capturedWhere.leadId, "lead_test_123");
        assert.equal(capturedWhere.lead, undefined, "Should NOT contain nested lead check under Category A cutover");
        assert.equal(telemetryCalls.length, 1, "Should emit telemetry");
        assert.equal(telemetryCalls[0].name, "message_read_cutover_category_a");
        assert.equal(telemetryCalls[0].route, "getMessagesByLead");

      } finally {
        // Restore
        env.MESSAGE_READ_CUTOVER_A_ENABLED = originalFlag;
        process.env.MESSAGE_READ_CUTOVER_A_ENABLED = originalEnvVar;
        (prisma.lead.findFirst as any) = originalLeadFindFirst;
        (prisma.message.findMany as any) = originalMessageFindMany;
        (telemetryModule as any).emitPerformanceMetric = originalEmitPerformanceMetric;
      }
    },
  },
];
