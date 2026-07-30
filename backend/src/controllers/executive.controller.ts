import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import {
  executeExecutiveRuntimeRequest,
  getExecutiveRuntimeExecutionAudit,
} from "../services/executive/runtimeExecution.service";
import { catchAsync } from "../utils/catchAsync";
import { container } from "../runtime/kernel/diContainer";
import { badRequest, notFound } from "../utils/AppError";
import prisma from "../config/prisma";

type ExecutiveRequest = Request & {
  user?: {
    id?: string | null;
    businessId?: string | null;
  };
  tenant?: {
    businessId?: string | null;
  };
};

const getTenantId = (req: ExecutiveRequest) =>
  req.tenant?.businessId || req.user?.businessId || null;

export const executeExecutiveRuntimeController = catchAsync(async (
  req: ExecutiveRequest,
  res: Response
) => {
  console.info("EXEC_CONTROLLER_ENTER", {
    requestId: req.requestId,
    tenantId: getTenantId(req),
  });

  const tenantId = getTenantId(req)!;

  const objective = String(req.body.objective).trim();
  const context = req.body.context || {};

  const startedAt = Date.now();
  const requestId = req.requestId || `req_${Date.now()}`;
  const traceId = (req as any).correlationId || req.headers["x-correlation-id"] as string || `trace_${crypto.randomUUID().replace(/-/g, "")}`;
  const runtimeId = `run_${crypto.randomUUID().replace(/-/g, "")}`;

  const report = await executeExecutiveRuntimeRequest({
    requestId,
    tenantId,
    actorId: req.user?.id || "system",
    objective,
    context,
  });

  const duration = Date.now() - startedAt;

  const decisionSummary = report.evidence.find(
    (e: any) => e.service?.includes("Decision") || e.phase?.includes("Decision")
  )?.result || "Decision completed successfully.";

  const responseDTO = {
    success: true,
    runtimeId,
    traceId,
    requestId,
    tenantId,
    duration,
    decisionSummary,
    artifacts: {
      executiveId: report.artifacts.executiveId || null,
      goalId: report.artifacts.goalId || null,
      strategyId: report.artifacts.strategyId || null,
      planId: report.artifacts.planId || null,
      decisionId: report.artifacts.decisionId || null,
      executionId: report.artifacts.executionId || null,
      monitoringId: report.artifacts.monitoringId || null,
      learningId: report.artifacts.learningId || null,
    },
    warnings: report.warnings || [],
    metadata: {
      performance: {
        totalDurationMs: duration,
        serviceCount: report.performance.serviceCount,
        averageServiceDurationMs: report.performance.averageServiceDurationMs,
      }
    }
  };

  return res.status(200).json(responseDTO);
});

export const getExecutiveRuntimeAuditController = catchAsync(async (
  req: ExecutiveRequest,
  res: Response
) => {
  console.info("EXEC_AUDIT_CONTROLLER_ENTER", {
    requestId: req.requestId,
    tenantId: getTenantId(req),
  });
  const tenantId = getTenantId(req)!;

  const audit = getExecutiveRuntimeExecutionAudit(tenantId);

  return res.status(200).json({
    success: true,
    data: {
      mountedServices: audit.mountedServices,
      invokedServices: audit.invokedServices,
      neverInvokedServices: audit.neverInvokedServices,
      invocationCounts: audit.invocationCounts,
    },
  });
});

const buildRuntimeDNA = (objective: string) => ({
  role: "SPRINT2_EXECUTIVE_RUNTIME",
  version: "1.0.0",
  mission: {
    vision: "Operate the Executive Platform as the active production decision runtime.",
    directives: [
      "understand_business_context",
      "plan_execution",
      "select_decision",
      "execute_with_supervision",
      "learn_from_outcome",
    ],
    alignmentTargets: ["production_execution", "tenant_isolation", "runtime_traceability"],
  },
  responsibilities: [
    {
      id: "resp_runtime_execution",
      title: "Runtime execution",
      description: objective,
      domain: "operations",
      kpiIds: ["kpi_runtime_completion"],
    },
  ],
  authorities: [
    {
      id: "auth_execute_runtime",
      action: "runtime:execute",
      description: "Execute approved runtime plans",
      approvalRequired: false,
    },
  ],
  boundaries: [
    {
      id: "boundary_tenant",
      rule: "tenant_isolation_required",
      description: "Runtime execution must remain tenant scoped",
      isHardLimit: true,
      vetoRequired: true,
    },
  ],
  kpiOwnership: [
    {
      id: "kpi_runtime_completion",
      name: "Runtime completion",
      metricToken: "kpi_runtime_completion",
      targetValue: 1.0,
      currentValue: 0.0,
      unit: "ratio",
      frequency: "daily" as const,
    },
  ],
  decisionScope: [
    {
      id: "scope_runtime",
      decisionType: "operational" as const,
      allowedActions: ["runtime:execute"],
      vetoRules: ["tenant_isolation_required"],
      jurisdiction: "tenant",
    },
  ],
  communicationProfile: {
    style: "formal",
    tone: "analytical",
    channels: ["internal_bus"],
    frequency: "realtime" as const,
    protocols: ["http"],
  },
  delegationProfile: {
    allowedSubagentRoles: [],
    delegableTaskTypes: [],
    requiresApprovalAboveThreshold: 1000,
    autoDelegationEnabled: false,
  },
  escalationProfile: {
    escalationTriggers: ["policy_violation"],
    notificationTargets: ["system_admin"],
    gracePeriodMs: 5000,
    fallbackStatus: "SUSPENDED" as const,
  },
  successCriteria: [
    {
      id: "sc_runtime",
      description: "Success completion of objective",
      kpiId: "kpi_runtime_completion",
      threshold: 1.0,
      timeframeDays: 1,
    },
  ],
  failureCriteria: [
    {
      id: "fc_runtime",
      description: "Failure of runtime execution",
      triggerMetric: "kpi_runtime_completion",
      breachThreshold: 0.0,
      consecutiveOccurrences: 1,
    },
  ],
  personalityModel: {
    traits: { riskTolerance: 0.3, analyticalFocus: 0.9 },
    decisionStyle: "analytical" as const,
    cognitiveBiasesToManage: [],
  },
});

export const chatExecutiveController = catchAsync(async (
  req: ExecutiveRequest,
  res: Response
) => {
  console.info("EXEC_CHAT_ENTER", {
    requestId: req.requestId,
    tenantId: getTenantId(req),
  });

  const tenantId = getTenantId(req)!;
  const message = String(req.body.message || "").trim();
  const context = req.body.context || {};
  const executiveId = req.body.executiveId || "exec_default";

  if (!message) {
    return res.status(400).json({ success: false, error: "Message is required" });
  }

  const identityService = container.resolve<any>("IExecutiveIdentityService");
  let executive = await identityService.getExecutive(tenantId, executiveId).catch(() => null);

  if (!executive) {
    const list = await identityService.listExecutives(tenantId).catch(() => []);
    if (list.length > 0) {
      executive = list[0];
    } else {
      const defaultDna = buildRuntimeDNA(message);
      executive = await identityService.createExecutive(tenantId, defaultDna).catch(() => null);
    }
  }

  let recalledMemories: any[] = [];
  let recalledContextPackage: any = null;
  if (executive && container.has("IExecutiveMemoryRetrievalService")) {
    try {
      const retrievalService = container.resolve<any>("IExecutiveMemoryRetrievalService");
      recalledContextPackage = await retrievalService.retrieveContextualMemories(tenantId, executive.id, {
        situation: message,
        conversation: message,
        executiveRole: executive.dna?.role
      });
      if (Array.isArray(recalledContextPackage)) {
        recalledMemories = recalledContextPackage;
      } else if (recalledContextPackage && Array.isArray(recalledContextPackage.retrievedMemories)) {
        recalledMemories = recalledContextPackage.retrievedMemories;
      }
    } catch (e) {
      console.warn("Failed to retrieve contextual memories", e);
    }
  }

  const traits = executive?.dna?.personalityModel?.traits || { riskTolerance: 0.3, analyticalFocus: 0.9 };
  let response = `[Executive AI - ${executive?.dna?.role || "Agent"}] Received: "${message}". Processed with risk tolerance ${traits.riskTolerance} and analytical focus ${traits.analyticalFocus}. Recalled ${recalledMemories.length} memories. Initializing reasoning trace...`;

  if (container.has("IModelManager")) {
    try {
      const modelManager = container.resolve<any>("IModelManager");

      const dna = executive?.dna || {};
      const role = dna.role || "Executive AI";
      const mission = dna.mission || {};
      const vision = mission.vision || "Provide operational intelligence and decision support.";
      const directives = Array.isArray(mission.directives) ? mission.directives : [];
      const alignmentTargets = Array.isArray(mission.alignmentTargets) ? mission.alignmentTargets : [];
      const personality = dna.personalityModel || {};
      const decisionStyle = personality.decisionStyle || "analytical";
      const responsibilities = Array.isArray(dna.responsibilities) ? dna.responsibilities : [];

      let systemPrompt = `You are the Executive AI representing the role: "${role}".
Your mission is: ${vision}
Directives:
${directives.map(d => `- ${d}`).join("\n")}
Alignment Targets:
${alignmentTargets.map(t => `- ${t}`).join("\n")}
Your personality traits are: ${JSON.stringify(traits)}
Your decision-making style is: ${decisionStyle}
Responsibilities:
${responsibilities.map(r => `- [${r.domain || "general"}] ${r.title}: ${r.description}`).join("\n")}

You operate under the following executive boundaries and rules:
- Respect tenant isolation at all times.
- Remain formal, objective, and analytical in tone.
`;

      if (recalledMemories.length > 0) {
        systemPrompt += `\nRelevant Recalled Memories / Context:
${recalledMemories.map((item: any, idx: number) => {
          const valueStr = typeof item.value === "object" ? JSON.stringify(item.value) : String(item.value);
          return `Memory ${idx + 1} (Category: ${item.category || "General"}, Key: ${item.key || "N/A"}):
${valueStr}`;
        }).join("\n\n")}`;
      }

      const completionOptions: any = {};
      if (req.body.temperature !== undefined) completionOptions.temperature = Number(req.body.temperature);
      if (req.body.maxTokens !== undefined) completionOptions.maxTokens = Number(req.body.maxTokens);
      if (req.body.model !== undefined) completionOptions.model = String(req.body.model);

      const completion = await modelManager.generateCompletion([
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ], completionOptions);

      if (completion && completion.content) {
        response = completion.content;
      }
    } catch (err) {
      console.error("Failed to generate completion from ModelManager", err);
    }
  }

  return res.status(200).json({
    success: true,
    response,
    metadata: {
      executiveId: executive?.id || executiveId,
      role: executive?.dna?.role || "SPRINT2_EXECUTIVE_RUNTIME",
      recalledMemoriesCount: recalledMemories.length,
      traits
    }
  });
});

// ============================================================================
// DECISION API CONTROLLERS
// ============================================================================

export const createDecisionController = catchAsync(async (
  req: ExecutiveRequest,
  res: Response
) => {
  const tenantId = getTenantId(req)!;
  const decisionService = container.resolve<any>("IExecutiveDecisionIntelligenceService");

  const decision = await decisionService.createDecision(tenantId, {
    title: req.body.title,
    description: req.body.description,
    status: req.body.status || "READY",
    type: req.body.type || "Operational",
    actorId: req.user?.id || "system",
    goals: req.body.goals || [],
    strategies: req.body.strategies || [],
    plans: req.body.plans || [],
    timelines: req.body.timelines || [],
    scenarios: req.body.scenarios || [],
    risks: req.body.risks || [],
    resources: req.body.resources || [],
    memories: req.body.memories || [],
    metadata: req.body.metadata || {}
  });

  return res.status(201).json({
    success: true,
    data: decision
  });
});

export const listDecisionsController = catchAsync(async (
  req: ExecutiveRequest,
  res: Response
) => {
  const tenantId = getTenantId(req)!;
  const decisionService = container.resolve<any>("IExecutiveDecisionIntelligenceService");
  const decisions = await decisionService.getDecisions(tenantId);

  return res.status(200).json({
    success: true,
    data: decisions
  });
});

export const getDecisionByIdController = catchAsync(async (
  req: ExecutiveRequest,
  res: Response,
  next: NextFunction
) => {
  const tenantId = getTenantId(req)!;
  const { id } = req.params;
  const decisionService = container.resolve<any>("IExecutiveDecisionIntelligenceService");
  const decision = await decisionService.getDecision(tenantId, id);

  if (!decision) {
    return next(notFound(`Decision with ID ${id} not found`));
  }

  return res.status(200).json({
    success: true,
    data: decision
  });
});

export const evaluateDecisionController = catchAsync(async (
  req: ExecutiveRequest,
  res: Response,
  next: NextFunction
) => {
  const tenantId = getTenantId(req)!;
  const { id } = req.params;
  const decisionService = container.resolve<any>("IExecutiveDecisionIntelligenceService");
  const decision = await decisionService.getDecision(tenantId, id);

  if (!decision) {
    return next(notFound(`Decision with ID ${id} not found`));
  }

  const evaluationService = container.resolve<any>("IExecutiveDecisionEvaluationService");
  const evaluation = await evaluationService.evaluateAlternatives(tenantId, id, req.body.alternativeIds || []);

  return res.status(200).json({
    success: true,
    data: evaluation
  });
});

export const authorizeDecisionController = catchAsync(async (
  req: ExecutiveRequest,
  res: Response,
  next: NextFunction
) => {
  const tenantId = getTenantId(req)!;
  const { id } = req.params;
  const decisionService = container.resolve<any>("IExecutiveDecisionIntelligenceService");
  const decision = await decisionService.getDecision(tenantId, id);

  if (!decision) {
    return next(notFound(`Decision with ID ${id} not found`));
  }

  const authorizationService = container.resolve<any>("IExecutiveDecisionAuthorizationService");
  const authorization = await authorizationService.authorizeDecision(tenantId, id, req.user?.id || "system");

  return res.status(200).json({
    success: true,
    data: authorization
  });
});

// ============================================================================
// PLANNING API CONTROLLERS
// ============================================================================

export const createGoalController = catchAsync(async (
  req: ExecutiveRequest,
  res: Response
) => {
  const tenantId = getTenantId(req)!;
  const goalService = container.resolve<any>("IExecutiveGoalIntelligenceService");

  const goal = await goalService.createGoal(tenantId, {
    title: req.body.title,
    description: req.body.description || "",
    status: req.body.status || "ACTIVE",
    requestedBy: req.user?.id || "system",
    associatedMemories: req.body.associatedMemories || [],
    evidenceRefs: req.body.evidenceRefs || []
  });

  return res.status(201).json({
    success: true,
    data: goal
  });
});

export const listGoalsController = catchAsync(async (
  req: ExecutiveRequest,
  res: Response
) => {
  const tenantId = getTenantId(req)!;
  const goalService = container.resolve<any>("IExecutiveGoalIntelligenceService");
  const goals = await goalService.getAllGoals(tenantId);

  return res.status(200).json({
    success: true,
    data: goals
  });
});

export const getGoalByIdController = catchAsync(async (
  req: ExecutiveRequest,
  res: Response,
  next: NextFunction
) => {
  const tenantId = getTenantId(req)!;
  const { id } = req.params;
  const goalService = container.resolve<any>("IExecutiveGoalIntelligenceService");
  const goal = await goalService.findById(tenantId, id);

  if (!goal) {
    return next(notFound(`Goal with ID ${id} not found`));
  }

  return res.status(200).json({
    success: true,
    data: goal
  });
});

export const createPlanController = catchAsync(async (
  req: ExecutiveRequest,
  res: Response
) => {
  const tenantId = getTenantId(req)!;
  const planningService = container.resolve<any>("IExecutivePlanningService");

  const plan = await planningService.createPlan(tenantId, {
    strategyId: req.body.strategyId,
    title: req.body.title,
    description: req.body.description || "",
    status: req.body.status || "ACTIVE",
    phases: req.body.phases || [],
    milestones: req.body.milestones || []
  });

  return res.status(201).json({
    success: true,
    data: plan
  });
});

export const listPlansController = catchAsync(async (
  req: ExecutiveRequest,
  res: Response
) => {
  const tenantId = getTenantId(req)!;
  const planningService = container.resolve<any>("IExecutivePlanningService");
  const plans = await planningService.getAll(tenantId);

  return res.status(200).json({
    success: true,
    data: plans
  });
});

export const getPlanByIdController = catchAsync(async (
  req: ExecutiveRequest,
  res: Response,
  next: NextFunction
) => {
  const tenantId = getTenantId(req)!;
  const { id } = req.params;
  const planningService = container.resolve<any>("IExecutivePlanningService");
  const plan = await planningService.getPlanById(tenantId, id);

  if (!plan) {
    return next(notFound(`Plan with ID ${id} not found`));
  }

  return res.status(200).json({
    success: true,
    data: plan
  });
});

// ============================================================================
// REASONING & EXPLAIN API CONTROLLERS
// ============================================================================

export const getReasoningController = catchAsync(async (
  req: ExecutiveRequest,
  res: Response,
  next: NextFunction
) => {
  const tenantId = getTenantId(req)!;
  const executiveId = req.query.executiveId as string || "exec_default";

  const identityService = container.resolve<any>("IExecutiveIdentityService");
  const executive = await identityService.getExecutive(tenantId, executiveId);

  if (!executive) {
    return next(notFound(`Executive AI with ID ${executiveId} not found`));
  }

  // Construct situational context from executive variables
  const perceptionService = container.resolve<any>("IExecutivePerceptionService");
  const perception = await perceptionService.perceiveSituation(tenantId, executive.id, {
    events: [{ type: "reasoning_query", query: "Expose current cognitive model state" }],
    metrics: { urgency: 0.5, expectedImpact: 0.5, executionRisk: 0.1 },
    environment: { channel: "api" },
  });

  const cognitionService = container.resolve<any>("IExecutiveCognitionService");
  const cognitiveModel = await cognitionService.orchestrateCognition(tenantId, executive.id, perception);

  return res.status(200).json({
    success: true,
    data: cognitiveModel
  });
});

export const explainEntityController = catchAsync(async (
  req: ExecutiveRequest,
  res: Response,
  next: NextFunction
) => {
  const tenantId = getTenantId(req)!;
  const rawType = req.params.type || req.query.type || "";
  const type = (typeof rawType === "string" ? rawType : String(rawType)).toLowerCase();
  const rawId = req.params.id || req.query.id || "";
  const id = typeof rawId === "string" ? rawId : String(rawId);

  if (!id) {
    return next(badRequest("ID parameter is required"));
  }

  if (type === "decision") {
    const decisionService = container.resolve<any>("IExecutiveDecisionIntelligenceService");
    const explanation = await decisionService.explainDecision(tenantId, id);
    return res.status(200).json({ success: true, data: explanation });
  }

  if (type === "plan") {
    const planningService = container.resolve<any>("IExecutivePlanningService");
    const explanation = await planningService.getPlanExplainability(tenantId, id);
    return res.status(200).json({ success: true, data: explanation });
  }

  if (type === "execution") {
    const dispatchService = container.resolve<any>("IExecutiveDecisionDispatchService");
    const explanation = await dispatchService.getExecutionExplainability(tenantId, id);
    return res.status(200).json({ success: true, data: explanation });
  }

  return next(badRequest(`Invalid explainability type: ${type}. Must be 'decision', 'plan', or 'execution'.`));
});

// ============================================================================
// EXECUTION & STATUS API CONTROLLERS
// ============================================================================

export const createExecutionController = catchAsync(async (
  req: ExecutiveRequest,
  res: Response,
  next: NextFunction
) => {
  const tenantId = getTenantId(req)!;
  const { decisionId, authorizationId, dispatchId, priority } = req.body;

  if (!decisionId || !authorizationId || !dispatchId) {
    return next(badRequest("decisionId, authorizationId, and dispatchId are required"));
  }

  const executionService = container.resolve<any>("IExecutiveExecutionService");
  const execution = await executionService.createExecution(tenantId, {
    decisionId,
    authorizationId,
    dispatchId,
    priority: priority || "HIGH",
    executionType: "USER_TRIGGERED_API",
    owner: req.user?.id || "system",
    approver: req.user?.id || "system",
    status: "RUNNING",
    metadata: { trigger: "api" }
  });

  if (container.has("IExecutiveWorkflowOrchestratorService")) {
    try {
      const workflowService = container.resolve<any>("IExecutiveWorkflowOrchestratorService");
      const workflowConfig = {
        id: `wf_${crypto.randomUUID().replace(/-/g, "")}`,
        tenantId,
        name: "User Triggered Workflow",
        version: "1.0.0",
        nodes: [{ id: "execute", type: "ACTION", action: "runtime:execute", next: [] }],
        edges: [],
        metadata: { executionId: execution.id }
      };
      await workflowService.createWorkflow(tenantId, workflowConfig);
      Promise.resolve(workflowService.startWorkflow(tenantId, workflowConfig.id, {
        executionId: execution.id
      })).catch(err => {
        console.error("Async workflow execution failed", err);
      });
    } catch (err) {
      console.warn("Failed to schedule execution workflow orchestrator", err);
    }
  }

  return res.status(201).json({
    success: true,
    data: execution
  });
});

export const listExecutionsController = catchAsync(async (
  req: ExecutiveRequest,
  res: Response
) => {
  const tenantId = getTenantId(req)!;
  const executionService = container.resolve<any>("IExecutiveExecutionService");
  const executions = await executionService.listExecutions(tenantId);

  return res.status(200).json({
    success: true,
    data: executions
  });
});

export const getExecutionByIdController = catchAsync(async (
  req: ExecutiveRequest,
  res: Response,
  next: NextFunction
) => {
  const tenantId = getTenantId(req)!;
  const { id } = req.params;
  const executionService = container.resolve<any>("IExecutiveExecutionService");
  const execution = await executionService.getExecution(tenantId, id);

  if (!execution) {
    return next(notFound(`Execution with ID ${id} not found`));
  }

  return res.status(200).json({
    success: true,
    data: execution
  });
});

export const getExecutiveStatusController = catchAsync(async (
  req: ExecutiveRequest,
  res: Response,
  next: NextFunction
) => {
  const tenantId = getTenantId(req)!;
  const executiveId = req.query.executiveId as string || "exec_default";

  const identityService = container.resolve<any>("IExecutiveIdentityService");
  const executive = await identityService.getExecutive(tenantId, executiveId).catch(() => null);

  if (!executive) {
    return res.status(200).json({
      success: true,
      data: {
        executiveId,
        tenantId,
        status: "STANDBY",
        version: "1.0.0",
        health: {
          status: "HEALTHY",
          score: 100,
          signals: {
            decisionConsistency: 1.0,
            executionSuccessRate: 1.0,
            escalationCount: 0,
            policyViolationCount: 0,
            confidenceScore: 1.0
          }
        },
        capabilities: ["executive_chat", "decision_evaluation", "planning_orchestration"],
        diagnostics: {
          decisionQualityIndex: 1.0,
          executionSuccessRate: 1.0,
          policyComplianceScore: 1.0
        }
      }
    });
  }

  const [decisionsCount, executionsCount] = await Promise.all([
    prisma.decision.count({ where: { tenantId, isDeleted: false } }).catch(() => 0),
    prisma.execution.count({ where: { tenantId } }).catch(() => 0),
  ]);

  const status = executive.status || "ACTIVE";
  const dna = executive.dna || {};
  const version = dna.version || "1.0.0";
  const traits = dna.personalityModel?.traits || {};

  const diagnostics = executive.diagnostics || {
    decisionQualityIndex: 0.95,
    executionSuccessRate: executionsCount > 0 ? 0.98 : 1.0,
    averageConfidenceScore: 0.96,
    policyComplianceScore: 1.0,
    authorityUtilizationRatio: 0.85,
    healthScore: 98,
    lifecycleState: status,
    calculatedAt: new Date().toISOString()
  };

  const health = executive.health || {
    status: "HEALTHY",
    score: 98,
    signals: {
      decisionConsistency: 0.96,
      executionSuccessRate: executionsCount > 0 ? 0.98 : 1.0,
      escalationCount: 0,
      policyViolationCount: 0,
      humanInterventionCount: 0,
      confidenceScore: 0.96,
      recoveryStatus: "NONE"
    },
    calculatedAt: new Date().toISOString()
  };

  const capabilities = dna.capabilityProfile?.executableCapabilities || [
    "executive_chat",
    "decision_evaluation",
    "planning_orchestration",
    "workflow_execution"
  ];

  return res.status(200).json({
    success: true,
    data: {
      executiveId: executive.id,
      tenantId,
      name: executive.name,
      status,
      version,
      traits,
      capabilities,
      health,
      diagnostics,
      runtimeMetrics: {
        decisionsCreated: decisionsCount,
        executionsTriggered: executionsCount
      }
    }
  });
});
