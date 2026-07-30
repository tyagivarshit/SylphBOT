import assert from "node:assert/strict";
import { container } from "../runtime/kernel/diContainer";
import { chatExecutiveController } from "../controllers/executive.controller";

const runTests = async () => {
  console.log("Running Chat API unit tests...");

  // Mock IExecutiveIdentityService and register it
  const mockIdentityService = {
    getExecutive: async (tenantId: string, id: string) => {
      return {
        id,
        tenantId,
        dna: {
          role: "MOCK_EXECUTIVE",
          personalityModel: {
            traits: { riskTolerance: 0.4, analyticalFocus: 0.8 }
          }
        }
      };
    },
    listExecutives: async (tenantId: string) => {
      return [];
    },
    createExecutive: async (tenantId: string, dna: any) => {
      return {
        id: "mock_created",
        tenantId,
        dna
      };
    }
  };

  const mockMemoryRetrieval = {
    retrieveContextualMemories: async (tenantId: string, executiveId: string, options: any) => {
      return [{ id: "mem1", content: "mock memory" }];
    }
  };

  // Re-register stubs in container
  if (container.has("IExecutiveIdentityService")) {
    (container as any).registrations.delete("IExecutiveIdentityService");
    (container as any).singletons.delete("IExecutiveIdentityService");
  }
  container.registerInstance("IExecutiveIdentityService", mockIdentityService);

  if (container.has("IExecutiveMemoryRetrievalService")) {
    (container as any).registrations.delete("IExecutiveMemoryRetrievalService");
    (container as any).singletons.delete("IExecutiveMemoryRetrievalService");
  }
  container.registerInstance("IExecutiveMemoryRetrievalService", mockMemoryRetrieval);

  // Invoke controller with mock req and res
  const req = {
    body: { message: "Hello Executive", context: {} },
    tenant: { businessId: "tenant_test_1" },
    user: { id: "user_test", businessId: "tenant_test_1" },
    requestId: "req_chat_test"
  } as any;

  let statusCode = 0;
  let responseData: any = null;
  let resolveResponse: () => void;
  const responsePromise = new Promise<void>((resolve) => {
    resolveResponse = resolve;
  });

  const res = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      responseData = data;
      resolveResponse();
      return res;
    }
  } as any;

  // Invoke controller
  chatExecutiveController(req, res, (err) => {
    if (err) {
      console.error("Test got next error", err);
      resolveResponse();
    }
  });

  await responsePromise;

  assert.equal(statusCode, 200);
  assert.equal(responseData.success, true);
  assert.equal(responseData.metadata.executiveId, "exec_default");
  assert.equal(responseData.metadata.role, "MOCK_EXECUTIVE");
  assert.equal(responseData.metadata.recalledMemoriesCount, 1);
  assert.ok(responseData.response.includes("Processed with risk tolerance 0.4"));

  console.log("✅ Chat API Mock tests passed successfully!");
};

runTests().catch(err => {
  console.error("❌ Chat API Mock tests failed:", err);
  process.exit(1);
});
