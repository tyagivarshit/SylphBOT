import { Router } from "express";
import {
  executeExecutiveRuntimeController,
  getExecutiveRuntimeAuditController,
  chatExecutiveController,
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
  getExecutiveStatusController,
} from "../controllers/executive.controller";
import { auditRequest } from "../middleware/audit.middleware";
import { requirePermission } from "../middleware/rbac.middleware";
import { attachBillingContext } from "../middleware/subscription.middleware";
import { requireBusinessContext } from "../middleware/tenant.middleware";
import { subscriptionGuard } from "../middleware/subscriptionGuard.middleware";
import { executiveLimiter } from "../middleware/rateLimit.middleware";
import { badRequest } from "../utils/AppError";

const router = Router();

const validateExecutivePayload = (req: any, res: any, next: any) => {
  const body = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return next(badRequest("Invalid request body"));
  }

  const allowedKeys = new Set(["objective", "context"]);
  const bodyKeys = Object.keys(body);

  for (const key of bodyKeys) {
    if (!allowedKeys.has(key)) {
      return next(badRequest(`Unknown payload property: ${key}`, { unknownField: key }));
    }
  }

  if (!("objective" in body)) {
    return next(badRequest("objective is required", { missingField: "objective" }));
  }

  const objective = body.objective;

  if (typeof objective !== "string") {
    return next(badRequest("objective must be a string", { invalidType: "objective" }));
  }

  if (objective.trim() === "") {
    return next(badRequest("objective must not be an empty string", { invalidValue: "objective" }));
  }

  if ("context" in body) {
    const context = body.context;
    if (context !== undefined && context !== null) {
      if (typeof context !== "object" || Array.isArray(context)) {
        return next(badRequest("context must be a plain object", { invalidType: "context" }));
      }
    }
  }

  next();
};

router.use(requireBusinessContext);
router.use(requirePermission("executive:execute"));
router.use(subscriptionGuard);
router.use(attachBillingContext);

router.post(
  "/runtime/execute",
  executiveLimiter,
  validateExecutivePayload,
  auditRequest("executive.runtime_execute"),
  executeExecutiveRuntimeController
);

router.post(
  "/chat",
  executiveLimiter,
  auditRequest("executive.chat"),
  chatExecutiveController
);

router.get("/runtime/audit", executiveLimiter, getExecutiveRuntimeAuditController);

const validateDecisionCreatePayload = (req: any, res: any, next: any) => {
  const { title, description } = req.body;
  if (!title || typeof title !== "string" || title.trim() === "") {
    return next(badRequest("title is required and must be a non-empty string"));
  }
  if (!description || typeof description !== "string" || description.trim() === "") {
    return next(badRequest("description is required and must be a non-empty string"));
  }
  next();
};

const validateDecisionEvaluatePayload = (req: any, res: any, next: any) => {
  const { alternativeIds } = req.body;
  if (!alternativeIds || !Array.isArray(alternativeIds)) {
    return next(badRequest("alternativeIds is required and must be an array of strings"));
  }
  next();
};

const validateGoalCreatePayload = (req: any, res: any, next: any) => {
  const { title } = req.body;
  if (!title || typeof title !== "string" || title.trim() === "") {
    return next(badRequest("title is required and must be a non-empty string"));
  }
  next();
};

const validatePlanCreatePayload = (req: any, res: any, next: any) => {
  const { title, strategyId } = req.body;
  if (!title || typeof title !== "string" || title.trim() === "") {
    return next(badRequest("title is required and must be a non-empty string"));
  }
  if (!strategyId || typeof strategyId !== "string" || strategyId.trim() === "") {
    return next(badRequest("strategyId is required and must be a non-empty string"));
  }
  next();
};

// Decisions API
router.post(
  "/decisions",
  executiveLimiter,
  validateDecisionCreatePayload,
  auditRequest("executive.decision_create"),
  createDecisionController
);

router.get(
  "/decisions",
  executiveLimiter,
  auditRequest("executive.decision_list"),
  listDecisionsController
);

router.get(
  "/decisions/:id",
  executiveLimiter,
  auditRequest("executive.decision_get"),
  getDecisionByIdController
);

router.post(
  "/decisions/:id/evaluate",
  executiveLimiter,
  validateDecisionEvaluatePayload,
  auditRequest("executive.decision_evaluate"),
  evaluateDecisionController
);

router.post(
  "/decisions/:id/authorize",
  executiveLimiter,
  auditRequest("executive.decision_authorize"),
  authorizeDecisionController
);

// Planning API (Goals & Plans)
router.post(
  "/goals",
  executiveLimiter,
  validateGoalCreatePayload,
  auditRequest("executive.goal_create"),
  createGoalController
);

router.get(
  "/goals",
  executiveLimiter,
  auditRequest("executive.goal_list"),
  listGoalsController
);

router.get(
  "/goals/:id",
  executiveLimiter,
  auditRequest("executive.goal_get"),
  getGoalByIdController
);

router.post(
  "/plans",
  executiveLimiter,
  validatePlanCreatePayload,
  auditRequest("executive.plan_create"),
  createPlanController
);

router.get(
  "/plans",
  executiveLimiter,
  auditRequest("executive.plan_list"),
  listPlansController
);

router.get(
  "/plans/:id",
  executiveLimiter,
  auditRequest("executive.plan_get"),
  getPlanByIdController
);

// Reasoning API
router.get(
  "/reasoning",
  executiveLimiter,
  auditRequest("executive.reasoning_get"),
  getReasoningController
);

// Explain API
router.get(
  "/explain",
  executiveLimiter,
  auditRequest("executive.explain_get"),
  explainEntityController
);

router.get(
  "/explain/:type/:id",
  executiveLimiter,
  auditRequest("executive.explain_get"),
  explainEntityController
);

const validateExecutionCreatePayload = (req: any, res: any, next: any) => {
  const { decisionId, authorizationId, dispatchId } = req.body;
  if (!decisionId || typeof decisionId !== "string" || decisionId.trim() === "") {
    return next(badRequest("decisionId is required and must be a non-empty string"));
  }
  if (!authorizationId || typeof authorizationId !== "string" || authorizationId.trim() === "") {
    return next(badRequest("authorizationId is required and must be a non-empty string"));
  }
  if (!dispatchId || typeof dispatchId !== "string" || dispatchId.trim() === "") {
    return next(badRequest("dispatchId is required and must be a non-empty string"));
  }
  next();
};

// Execution API
router.post(
  "/executions",
  executiveLimiter,
  validateExecutionCreatePayload,
  auditRequest("executive.execution_create"),
  createExecutionController
);

router.get(
  "/executions",
  executiveLimiter,
  auditRequest("executive.execution_list"),
  listExecutionsController
);

router.get(
  "/executions/:id",
  executiveLimiter,
  auditRequest("executive.execution_get"),
  getExecutionByIdController
);

// Status API
router.get(
  "/status",
  executiveLimiter,
  auditRequest("executive.status_get"),
  getExecutiveStatusController
);

export default router;
