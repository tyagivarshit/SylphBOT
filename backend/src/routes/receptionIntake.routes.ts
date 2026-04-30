import { Router } from "express";
import { requireBusinessContext } from "../middleware/tenant.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { resolveOrCreateReceptionLead } from "../services/receptionLead.service";
import { receiveInboundInteraction } from "../services/receptionIntake.service";
import {
  getInboxDashboardProjection,
  getOwnerCopilotProjection,
} from "../services/inboxDashboardProjection.service";

const router = Router();

router.use(requireBusinessContext);

const buildIntakeHandler =
  (adapter: "EMAIL" | "FORM" | "VOICE") =>
  asyncHandler(async (req, res) => {
    const businessId = req.tenant?.businessId;

    if (!businessId) {
      return res.status(403).json({
        success: false,
        requestId: req.requestId,
        message: "Business context is required",
      });
    }

    const payload = req.body || {};
    const clientId =
      typeof payload.clientId === "string" ? payload.clientId.trim() : null;
    const lead = await resolveOrCreateReceptionLead({
      businessId,
      clientId,
      adapter,
      payload,
    });
    const result = await receiveInboundInteraction({
      businessId,
      leadId: lead.id,
      clientId: clientId || lead.clientId || null,
      adapter,
      payload,
      providerMessageIdHint:
        typeof payload.providerMessageId === "string"
          ? payload.providerMessageId.trim()
          : typeof payload.messageId === "string"
          ? payload.messageId.trim()
          : typeof payload.submissionId === "string"
          ? payload.submissionId.trim()
          : typeof payload.transcriptId === "string"
          ? payload.transcriptId.trim()
          : null,
      correlationId:
        typeof payload.correlationId === "string"
          ? payload.correlationId.trim()
          : req.requestId,
      traceId:
        typeof payload.traceId === "string"
          ? payload.traceId.trim()
          : req.requestId,
      metadata: {
        intakePath: `/api/inbox/intake/${adapter.toLowerCase()}`,
        requestId: req.requestId,
      },
    });

    res.status(202).json({
      success: true,
      requestId: req.requestId,
      interactionId: result.interaction.id,
      externalInteractionKey: result.interaction.externalInteractionKey,
      created: result.created,
    });
  });

router.post("/email", buildIntakeHandler("EMAIL"));
router.post("/form", buildIntakeHandler("FORM"));
router.post("/voice", buildIntakeHandler("VOICE"));

router.get(
  "/dashboard-feed",
  asyncHandler(async (req, res) => {
    const businessId = req.tenant?.businessId;
    const projection = await getInboxDashboardProjection({
      businessId,
    });

    res.json({
      success: true,
      requestId: req.requestId,
      data: projection,
    });
  })
);

router.get(
  "/owner-copilot-feed",
  asyncHandler(async (req, res) => {
    const businessId = req.tenant?.businessId;

    if (!businessId) {
      return res.status(403).json({
        success: false,
        requestId: req.requestId,
        message: "Business context is required",
      });
    }

    const projection = await getOwnerCopilotProjection({
      businessId,
    });

    res.json({
      success: true,
      requestId: req.requestId,
      data: projection,
    });
  })
);

export default router;
