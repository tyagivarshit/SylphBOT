import { Request, Response } from "express";
import { commerceProjectionService } from "../services/commerceProjection.service";

export const commerceWebhook = async (req: Request, res: Response) => {
  const provider = String(req.params.provider || "").trim().toUpperCase();

  if (!provider) {
    return res.status(400).json({
      success: false,
      message: "provider_required",
    });
  }

  try {
    const reconciled = await commerceProjectionService.reconcileProviderWebhook({
      provider,
      headers: req.headers as Record<string, unknown>,
      body: req.body,
      strictBusinessId: null,
    });

    return res.json({
      success: true,
      data: {
        replay: Boolean((reconciled as any)?.replay),
        unmatched: Boolean((reconciled as any)?.unmatched),
        idempotency: (reconciled as any)?.idempotency || null,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "commerce_webhook_failed",
    });
  }
};
