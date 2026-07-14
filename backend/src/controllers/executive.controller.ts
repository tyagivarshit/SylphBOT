import type { Request, Response } from "express";
import crypto from "crypto";
import {
  executeExecutiveRuntimeRequest,
  getExecutiveRuntimeExecutionAudit,
} from "../services/executive/runtimeExecution.service";
import { catchAsync } from "../utils/catchAsync";

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
