import crypto from "crypto";
import { type RequestHandler, Router } from "express";
import { getInboxDashboardProjection } from "../services/inboxDashboardProjection.service";
import { getQueueHealth } from "../services/queueHealth.service";
import { getReceptionMetricsSnapshot } from "../services/receptionMetrics.service";
import { getSystemHealth } from "../services/systemHealth.service";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const isValidInternalKey = (
  providedKey: string | undefined,
  expectedKey: string | undefined
) => {
  if (!providedKey || !expectedKey) {
    return false;
  }

  const providedBuffer = Buffer.from(providedKey);
  const expectedBuffer = Buffer.from(expectedKey);

  return (
    providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  );
};

const requireInternalHealthKey: RequestHandler = (req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    return next();
  }

  const internalKey = req.get("x-internal-key")?.trim();
  const expectedKey = process.env.INTERNAL_API_KEY?.trim();

  if (!isValidInternalKey(internalKey, expectedKey)) {
    return res.status(403).json({
      success: false,
      requestId: req.requestId,
      message: "Forbidden",
    });
  }

  return next();
};

router.use(requireInternalHealthKey);

router.get(
  "/queue",
  asyncHandler(async (req, res) => {
    const queues = await getQueueHealth();

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      queues,
    });
  })
);

router.get(
  "/system",
  asyncHandler(async (req, res) => {
    const health = await getSystemHealth();

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      ...health,
    });
  })
);

router.get(
  "/reception-metrics",
  asyncHandler(async (req, res) => {
    res.status(200).json({
      success: true,
      requestId: req.requestId,
      metrics: getReceptionMetricsSnapshot(),
    });
  })
);

router.get(
  "/reception-dashboard",
  asyncHandler(async (req, res) => {
    const projection = await getInboxDashboardProjection();

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      projection,
    });
  })
);

export default router;
