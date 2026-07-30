import assert from "node:assert/strict";
import { container } from "../runtime/kernel/diContainer";
import prisma from "../config/prisma";
import {
  createDecisionController,
  listDecisionsController,
  getDecisionByIdController,
  evaluateDecisionController,
  authorizeDecisionController,
  createGoalController,
  listGoalsController,
  getGoalByIdController,
  createPlanController,
  listPlansController,
  getPlanByIdController,
  getReasoningController,
  explainEntityController,
  createExecutionController,
  listExecutionsController,
  getExecutionByIdController,
  getExecutiveStatusController
} from "../controllers/executive.controller";

const runTests = async () => {
  console.log("Running Decision and Planning API mock tests...");

  // Mock Prisma counts to prevent server selection timeout in test environment
  (prisma.decision as any).count = async () => 1;
  (prisma.execution as any).count = async () => 1;

  // 1. Mock Services
  const mockDecisionService = {
    createDecision: async (tenantId: string, data: any) => ({
      id: "dec_123",
      tenantId,
      title: data.title,
      description: data.description,
      status: data.status || "READY"
    }),
    getDecisions: async (tenantId: string) => [
      { id: "dec_123", tenantId, title: "Mock Decision", description: "Test decision" }
    ],
    getDecision: async (tenantId: string, id: string) => {
      if (id === "dec_123") {
        return { id: "dec_123", tenantId, title: "Mock Decision", description: "Test decision" };
      }
      return null;
    },
    explainDecision: async (tenantId: string, id: string) => ({
      decisionId: id,
      tenantId,
      whyThis: "mock explanation"
    })
  };

  const mockEvaluationService = {
    evaluateAlternatives: async (tenantId: string, decisionId: string, alternativeIds: string[]) => ({
      id: "eval_123",
      tenantId,
      decisionId,
      alternativeIds,
      scoredAlternatives: alternativeIds.map(id => ({ id, score: 0.85 }))
    })
  };

  const mockAuthorizationService = {
    authorizeDecision: async (tenantId: string, decisionId: string, actorId: string) => ({
      id: "auth_123",
      tenantId,
      decisionId,
      actorId,
      status: "AUTHORIZED",
      authorizedAt: new Date().toISOString()
    })
  };

  const mockGoalService = {
    createGoal: async (tenantId: string, data: any) => ({
      id: "goal_123",
      tenantId,
      title: data.title,
      status: data.status || "ACTIVE"
    }),
    getAllGoals: async (tenantId: string) => [
      { id: "goal_123", tenantId, title: "Mock Goal" }
    ],
    findById: async (tenantId: string, id: string) => {
      if (id === "goal_123") {
        return { id: "goal_123", tenantId, title: "Mock Goal" };
      }
      return null;
    }
  };

  const mockPlanningService = {
    createPlan: async (tenantId: string, data: any) => ({
      id: "plan_123",
      tenantId,
      strategyId: data.strategyId,
      title: data.title,
      status: data.status || "ACTIVE"
    }),
    getAll: async (tenantId: string) => [
      { id: "plan_123", tenantId, title: "Mock Plan" }
    ],
    getPlanById: async (tenantId: string, id: string) => {
      if (id === "plan_123") {
        return { id: "plan_123", tenantId, title: "Mock Plan" };
      }
      return null;
    },
    getPlanExplainability: async (tenantId: string, planId: string) => ({
      planId,
      tenantId,
      whyPhasesExist: {}
    })
  };

  const mockIdentityService = {
    getExecutive: async (tenantId: string, id: string) => {
      if (id === "non_existent") return null;
      return {
        id,
        tenantId,
        dna: {
          role: "TEST_EXECUTIVE",
          mission: { vision: "test vision", directives: [], alignmentTargets: [] },
          personalityModel: { traits: {}, decisionStyle: "analytical" },
          responsibilities: []
        }
      };
    }
  };

  const mockPerceptionService = {
    perceiveSituation: async (tenantId: string, executiveId: string, data: any) => ({
      id: "percept_123",
      signals: []
    })
  };

  const mockCognitionService = {
    orchestrateCognition: async (tenantId: string, executiveId: string, perception: any) => ({
      thinkingGraph: { nodes: [], edges: [] },
      readiness: { score: 0.95 }
    })
  };

  const mockDispatchService = {
    getExecutionExplainability: async (tenantId: string, dispatchId: string) => ({
      dispatchId,
      tenantId,
      explanation: "Mock execution explanation details"
    })
  };

  const mockExecutionService = {
    createExecution: async (tenantId: string, data: any) => ({
      id: "exec_run_123",
      tenantId,
      decisionId: data.decisionId,
      authorizationId: data.authorizationId,
      dispatchId: data.dispatchId,
      priority: data.priority || "HIGH",
      status: data.status || "RUNNING",
      metadata: data.metadata || {}
    }),
    listExecutions: async (tenantId: string) => [
      { id: "exec_run_123", tenantId, status: "RUNNING" }
    ],
    getExecution: async (tenantId: string, id: string) => {
      if (id === "exec_run_123") {
        return { id: "exec_run_123", tenantId, status: "RUNNING" };
      }
      return null;
    }
  };

  // Register in DI container
  const reregister = (token: string, instance: any) => {
    if (container.has(token)) {
      (container as any).registrations.delete(token);
      (container as any).singletons.delete(token);
    }
    container.registerInstance(token, instance);
  };

  reregister("IExecutiveDecisionIntelligenceService", mockDecisionService);
  reregister("IExecutiveDecisionEvaluationService", mockEvaluationService);
  reregister("IExecutiveDecisionAuthorizationService", mockAuthorizationService);
  reregister("IExecutiveGoalIntelligenceService", mockGoalService);
  reregister("IExecutivePlanningService", mockPlanningService);
  reregister("IExecutiveIdentityService", mockIdentityService);
  reregister("IExecutivePerceptionService", mockPerceptionService);
  reregister("IExecutiveCognitionService", mockCognitionService);
  reregister("IExecutiveDecisionDispatchService", mockDispatchService);
  reregister("IExecutiveExecutionService", mockExecutionService);
  reregister("IExecutiveDecisionDispatchService", mockDispatchService);

  // Helper helper to await controller responses
  const executeController = async (controller: any, req: any) => {
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

    controller(req, res, (err: any) => {
      if (err) resolveResponse();
    });

    await responsePromise;
    return { statusCode, responseData };
  };

  // Common context
  const commonReq = {
    tenant: { businessId: "tenant_test_1" },
    user: { id: "user_test", businessId: "tenant_test_1" }
  } as any;

  // --- DECISIONS API TESTS ---
  console.log("Testing Decisions API...");
  
  // 1. Create Decision
  const createDecRes = await executeController(createDecisionController, {
    ...commonReq,
    body: { title: "New Decision", description: "This is a test decision" }
  });
  assert.equal(createDecRes.statusCode, 201);
  assert.equal(createDecRes.responseData.success, true);
  assert.equal(createDecRes.responseData.data.title, "New Decision");

  // 2. List Decisions
  const listDecRes = await executeController(listDecisionsController, { ...commonReq });
  assert.equal(listDecRes.statusCode, 200);
  assert.equal(listDecRes.responseData.data.length, 1);

  // 3. Get Decision by ID
  const getDecRes = await executeController(getDecisionByIdController, {
    ...commonReq,
    params: { id: "dec_123" }
  });
  assert.equal(getDecRes.statusCode, 200);
  assert.equal(getDecRes.responseData.data.id, "dec_123");

  // 4. Evaluate Decision
  const evalDecRes = await executeController(evaluateDecisionController, {
    ...commonReq,
    params: { id: "dec_123" },
    body: { alternativeIds: ["alt_1", "alt_2"] }
  });
  assert.equal(evalDecRes.statusCode, 200);
  assert.equal(evalDecRes.responseData.data.id, "eval_123");
  assert.equal(evalDecRes.responseData.data.alternativeIds.length, 2);

  // 5. Authorize Decision
  const authDecRes = await executeController(authorizeDecisionController, {
    ...commonReq,
    params: { id: "dec_123" }
  });
  assert.equal(authDecRes.statusCode, 200);
  assert.equal(authDecRes.responseData.data.status, "AUTHORIZED");

  // --- PLANNING API TESTS ---
  console.log("Testing Planning API...");

  // 6. Create Goal
  const createGoalRes = await executeController(createGoalController, {
    ...commonReq,
    body: { title: "New Strategic Goal" }
  });
  assert.equal(createGoalRes.statusCode, 201);
  assert.equal(createGoalRes.responseData.data.title, "New Strategic Goal");

  // 7. List Goals
  const listGoalsRes = await executeController(listGoalsController, { ...commonReq });
  assert.equal(listGoalsRes.statusCode, 200);
  assert.equal(listGoalsRes.responseData.data.length, 1);

  // 8. Get Goal by ID
  const getGoalRes = await executeController(getGoalByIdController, {
    ...commonReq,
    params: { id: "goal_123" }
  });
  assert.equal(getGoalRes.statusCode, 200);
  assert.equal(getGoalRes.responseData.data.title, "Mock Goal");

  // 9. Create Plan
  const createPlanRes = await executeController(createPlanController, {
    ...commonReq,
    body: { title: "New Execution Plan", strategyId: "strat_123" }
  });
  assert.equal(createPlanRes.statusCode, 201);
  assert.equal(createPlanRes.responseData.data.title, "New Execution Plan");

  // 10. List Plans
  const listPlansRes = await executeController(listPlansController, { ...commonReq });
  assert.equal(listPlansRes.statusCode, 200);
  assert.equal(listPlansRes.responseData.data.length, 1);

  // 11. Get Plan by ID
  const getPlanRes = await executeController(getPlanByIdController, {
    ...commonReq,
    params: { id: "plan_123" }
  });
  assert.equal(getPlanRes.statusCode, 200);
  assert.equal(getPlanRes.responseData.data.title, "Mock Plan");

  // --- REASONING API TESTS ---
  console.log("Testing Reasoning API...");
  const reasoningRes = await executeController(getReasoningController, {
    ...commonReq,
    query: { executiveId: "exec_test_1" }
  });
  assert.equal(reasoningRes.statusCode, 200);
  assert.equal(reasoningRes.responseData.success, true);
  assert.ok(reasoningRes.responseData.data.thinkingGraph);

  // --- EXPLAIN API TESTS ---
  console.log("Testing Explain API...");

  // 1. Explain Decision
  const explainDecRes = await executeController(explainEntityController, {
    ...commonReq,
    params: { type: "decision", id: "dec_123" }
  });
  assert.equal(explainDecRes.statusCode, 200);
  assert.equal(explainDecRes.responseData.success, true);
  assert.equal(explainDecRes.responseData.data.decisionId, "dec_123");

  // 2. Explain Plan
  const explainPlanRes = await executeController(explainEntityController, {
    ...commonReq,
    params: { type: "plan", id: "plan_123" }
  });
  assert.equal(explainPlanRes.statusCode, 200);
  assert.equal(explainPlanRes.responseData.success, true);
  assert.equal(explainPlanRes.responseData.data.planId, "plan_123");

  // 3. Explain Execution
  const explainExecRes = await executeController(explainEntityController, {
    ...commonReq,
    params: { type: "execution", id: "dispatch_123" }
  });
  assert.equal(explainExecRes.statusCode, 200);
  assert.equal(explainExecRes.responseData.success, true);
  assert.equal(explainExecRes.responseData.data.dispatchId, "dispatch_123");

  // --- EXECUTION API TESTS ---
  console.log("Testing Execution API...");

  // 1. Create/Trigger Execution
  const createExecRes = await executeController(createExecutionController, {
    ...commonReq,
    body: {
      decisionId: "dec_123",
      authorizationId: "auth_123",
      dispatchId: "dispatch_123"
    }
  });
  assert.equal(createExecRes.statusCode, 201);
  assert.equal(createExecRes.responseData.success, true);
  assert.equal(createExecRes.responseData.data.id, "exec_run_123");

  // 2. List Executions
  const listExecsRes = await executeController(listExecutionsController, { ...commonReq });
  assert.equal(listExecsRes.statusCode, 200);
  assert.equal(listExecsRes.responseData.success, true);
  assert.equal(listExecsRes.responseData.data.length, 1);

  // 3. Get Execution by ID
  const getExecRes = await executeController(getExecutionByIdController, {
    ...commonReq,
    params: { id: "exec_run_123" }
  });
  assert.equal(getExecRes.statusCode, 200);
  assert.equal(getExecRes.responseData.success, true);
  assert.equal(getExecRes.responseData.data.id, "exec_run_123");

  // --- STATUS API TESTS ---
  console.log("Testing Status API...");

  // 1. Status for existing active Executive
  const statusActiveRes = await executeController(getExecutiveStatusController, {
    ...commonReq,
    query: { executiveId: "exec_test_1" }
  });
  assert.equal(statusActiveRes.statusCode, 200);
  assert.equal(statusActiveRes.responseData.success, true);
  assert.equal(statusActiveRes.responseData.data.status, "ACTIVE");

  // 2. Status for non-existent Executive (standby fallback)
  const statusStandbyRes = await executeController(getExecutiveStatusController, {
    ...commonReq,
    query: { executiveId: "non_existent" }
  });
  assert.equal(statusStandbyRes.statusCode, 200);
  assert.equal(statusStandbyRes.responseData.success, true);
  assert.equal(statusStandbyRes.responseData.data.status, "STANDBY");

  console.log("✅ All Decision, Planning, Reasoning, Explain, Execution, and Status API Mock tests passed successfully!");
};

runTests().catch(err => {
  console.error("❌ API Mock tests failed:", err);
  process.exit(1);
});
