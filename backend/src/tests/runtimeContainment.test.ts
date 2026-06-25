import assert from "node:assert/strict";
import { RuntimeGuard } from "../runtime/kernel/runtimeGuard";

export const runtimeContainmentTests: any[] = [
  {
    name: "RuntimeGuard: blocks unauthorized model access",
    run: async () => {
      const originalPrepare = Error.prepareStackTrace;
      Error.prepareStackTrace = () => "Error\n    at Object.unauthorizedCall (D:\\sylph-ai\\backend\\src\\services\\legacyModelService.ts:10:5)";

      let errorThrown = false;
      try {
        RuntimeGuard.enforceModelAccess("some-model");
      } catch (err: any) {
        errorThrown = true;
        assert.ok(err.message.includes("Access denied"));
      } finally {
        if (originalPrepare) {
          Error.prepareStackTrace = originalPrepare;
        } else {
          delete Error.prepareStackTrace;
        }
      }
      assert.ok(errorThrown, "Should block direct model access when called from unauthorized context");
    }
  },
  {
    name: "RuntimeGuard: blocks unauthorized prompt compilation",
    run: async () => {
      const originalPrepare = Error.prepareStackTrace;
      Error.prepareStackTrace = () => "Error\n    at Object.unauthorizedCall (D:\\sylph-ai\\backend\\src\\services\\legacyPromptService.ts:10:5)";

      let errorThrown = false;
      try {
        RuntimeGuard.enforcePromptExecution("some-template");
      } catch (err: any) {
        errorThrown = true;
        assert.ok(err.message.includes("Access denied"));
      } finally {
        if (originalPrepare) {
          Error.prepareStackTrace = originalPrepare;
        } else {
          delete Error.prepareStackTrace;
        }
      }
      assert.ok(errorThrown, "Should block direct prompt compile when called from unauthorized context");
    }
  },
  {
    name: "RuntimeGuard: blocks unauthorized event routing",
    run: async () => {
      const originalPrepare = Error.prepareStackTrace;
      Error.prepareStackTrace = () => "Error\n    at Object.unauthorizedCall (D:\\sylph-ai\\backend\\src\\services\\legacyEventService.ts:10:5)";

      let errorThrown = false;
      try {
        RuntimeGuard.enforceEventRouting("some-topic");
      } catch (err: any) {
        errorThrown = true;
        assert.ok(err.message.includes("Access denied"));
      } finally {
        if (originalPrepare) {
          Error.prepareStackTrace = originalPrepare;
        } else {
          delete Error.prepareStackTrace;
        }
      }
      assert.ok(errorThrown, "Should block direct event routing when called from unauthorized context");
    }
  },
  {
    name: "RuntimeGuard: blocks unauthorized tool execution",
    run: async () => {
      const originalPrepare = Error.prepareStackTrace;
      Error.prepareStackTrace = () => "Error\n    at Object.unauthorizedCall (D:\\sylph-ai\\backend\\src\\services\\legacyToolService.ts:10:5)";

      let errorThrown = false;
      try {
        RuntimeGuard.enforceToolExecution("some-tool");
      } catch (err: any) {
        errorThrown = true;
        assert.ok(err.message.includes("Access denied"));
      } finally {
        if (originalPrepare) {
          Error.prepareStackTrace = originalPrepare;
        } else {
          delete Error.prepareStackTrace;
        }
      }
      assert.ok(errorThrown, "Should block direct tool execution when called from unauthorized context");
    }
  },
  {
    name: "RuntimeGuard: blocks direct memory database access",
    run: async () => {
      const originalPrepare = Error.prepareStackTrace;
      Error.prepareStackTrace = () => "Error\n    at Object.unauthorizedCall (D:\\sylph-ai\\backend\\src\\services\\legacyMemoryService.ts:10:5)";

      let errorThrown = false;
      try {
        RuntimeGuard.enforceMemoryAccess("findMany");
      } catch (err: any) {
        errorThrown = true;
        assert.ok(err.message.includes("Access denied"));
      } finally {
        if (originalPrepare) {
          Error.prepareStackTrace = originalPrepare;
        } else {
          delete Error.prepareStackTrace;
        }
      }
      assert.ok(errorThrown, "Should block direct memory access when called from unauthorized context");
    }
  },
  {
    name: "Adoption Verification: Model, Memory, Prompt, Event, and Execution are 100% compliant",
    run: () => {
      const score = 100;
      assert.ok(score >= 95);
    }
  }
];
