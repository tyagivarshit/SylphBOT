import { Router } from "express";
import {
  executeExecutiveRuntimeController,
  getExecutiveRuntimeAuditController,
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

router.get("/runtime/audit", executiveLimiter, getExecutiveRuntimeAuditController);

export default router;
