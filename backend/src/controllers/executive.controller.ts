import type { Request, Response } from "express";
import {
  executeExecutiveRuntimeRequest,
  getExecutiveRuntimeExecutionAudit,
} from "../services/executive/runtimeExecution.service";

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

export const executeExecutiveRuntimeController = async (
  req: ExecutiveRequest,
  res: Response
) => {
  const tenantId = getTenantId(req);

  if (!tenantId) {
    return res.status(403).json({
      success: false,
      message: "Business context is required",
    });
  }

  const objective = String(req.body?.objective || "").trim();
  if (!objective) {
    return res.status(400).json({
      success: false,
      message: "objective is required",
    });
  }

  const report = await executeExecutiveRuntimeRequest({
    requestId: req.requestId || `req_${Date.now()}`,
    tenantId,
    actorId: req.user?.id || "system",
    objective,
    context:
      req.body?.context &&
      typeof req.body.context === "object" &&
      !Array.isArray(req.body.context)
        ? req.body.context
        : {},
  });

  return res.status(200).json({
    success: true,
    data: report,
  });
};

export const getExecutiveRuntimeAuditController = async (
  _req: ExecutiveRequest,
  res: Response
) => {
  return res.status(200).json({
    success: true,
    data: getExecutiveRuntimeExecutionAudit(),
  });
};
