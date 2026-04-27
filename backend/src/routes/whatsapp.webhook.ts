import { Router, Request, Response } from "express";
import prisma from "../config/prisma";
import { processWebhookEvent } from "../services/webhookDedup.service";
import { captureExceptionWithContext } from "../observability/sentry";
import { reconcileRevenueTouchDeliveryByProviderMessageId } from "../services/revenueTouchLedger.service";
import {
  extractMetaWebhookTimestamp,
  guardWebhookReplay,
  isWebhookTimestampFresh,
  verifyMetaWebhookSignature,
} from "../services/webhookSecurity.service";
import { resolveOrCreateReceptionLead } from "../services/receptionLead.service";
import { receiveInboundInteraction } from "../services/receptionIntake.service";

const router = Router();
const isProduction = process.env.NODE_ENV === "production";

const normalizeIdentifier = (value?: unknown) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

const buildClientLookupOr = ({
  pageIds = [],
  phoneNumberIds = [],
}: {
  pageIds?: string[];
  phoneNumberIds?: string[];
}) => [
  ...pageIds.map((pageId) => ({ pageId })),
  ...phoneNumberIds.map((phoneNumberId) => ({ phoneNumberId })),
];

const attachResolvedBusinessContext = (
  req: Request,
  client: { id: string; businessId: string; platform: string }
) => {
  (req as any).businessId = client.businessId;
  req.tenant = {
    businessId: client.businessId,
  };

  console.log("[WHATSAPP WEBHOOK] businessId resolved", {
    businessId: client.businessId,
    clientId: client.id,
    platform: client.platform,
  });
};

const findWhatsAppClient = async ({
  phoneNumberIds,
  pageIds = [],
}: {
  phoneNumberIds: string[];
  pageIds?: string[];
}) => {
  const lookupOr = buildClientLookupOr({
    phoneNumberIds,
    pageIds,
  });

  if (!lookupOr.length) {
    return null;
  }

  const client = await prisma.client.findFirst({
    where: {
      OR: lookupOr,
      isActive: true,
    },
  });

  if (!client) {
    console.error("❌ CRITICAL: Client mapping missing", {
      pageId: pageIds[0] || null,
      phoneNumberId: phoneNumberIds[0] || null,
      action: "Reconnect required",
    });
    return null;
  }

  console.log("[WHATSAPP WEBHOOK] client found", {
    phoneNumberIds,
    pageIds,
    clientId: client.id,
    businessId: client.businessId,
  });

  return client;
};

const getSignatureHeader = (req: Request) =>
  req.headers["x-hub-signature-256"] || req.headers["x-hub-signature"];

const parseBody = (req: any) => {
  if (Buffer.isBuffer(req.body)) {
    return JSON.parse(req.body.toString("utf8"));
  }

  throw new Error("Invalid webhook body");
};

const getWhatsAppDeliveryStatuses = (body: any) =>
  Array.isArray(body?.entry)
    ? body.entry.flatMap((entry: any) =>
        Array.isArray(entry?.changes)
          ? entry.changes.flatMap((change: any) =>
              Array.isArray(change?.value?.statuses) ? change.value.statuses : []
            )
          : []
      )
    : [];

const enforceWebhookSecurity = async (req: Request, body: any) => {
  const rawBody = Buffer.isBuffer((req as any).body)
    ? ((req as any).body as Buffer)
    : req.rawBody;
  const signature = getSignatureHeader(req);
  const secret = process.env.META_APP_SECRET?.trim() || null;

  if ((isProduction || secret) && (!rawBody || !verifyMetaWebhookSignature({
    rawBody,
    signature,
    secret,
  }))) {
    return false;
  }

  const timestampMs = extractMetaWebhookTimestamp(body);

  if (!isWebhookTimestampFresh(timestampMs)) {
    return false;
  }

  const replaySignature = Array.isArray(signature) ? signature[0] : signature;

  if (timestampMs && replaySignature) {
    const accepted = await guardWebhookReplay({
      platform: "WHATSAPP",
      signature: String(replaySignature),
      timestampMs,
    });

    if (!accepted) {
      return false;
    }
  }

  return true;
};

router.get("/", (req: Request, res: Response) => {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

router.post("/", async (req: any, res: Response) => {
  try {
    console.log("[WHATSAPP WEBHOOK] hit");

    const body = parseBody(req);

    if (!(await enforceWebhookSecurity(req, body))) {
      console.log("[WHATSAPP WEBHOOK] security validation failed");
      return res.sendStatus(403);
    }

    const deliveryStatuses = getWhatsAppDeliveryStatuses(body);
    let reconciledDeliveryStatus = false;

    for (const status of deliveryStatuses) {
      const providerMessageId = normalizeIdentifier(
        status?.id || status?.message_id
      );
      const deliveryStatus = String(status?.status || "").trim().toLowerCase();

      if (
        providerMessageId &&
        ["sent", "delivered", "read"].includes(deliveryStatus)
      ) {
        await reconcileRevenueTouchDeliveryByProviderMessageId({
          providerMessageId,
          deliveredAt: new Date(),
        }).catch(() => undefined);
        reconciledDeliveryStatus = true;
      }
    }

    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) {
      if (reconciledDeliveryStatus) {
        return res.sendStatus(200);
      }

      return res.sendStatus(200);
    }

    const eventId = message?.id;
    const shouldProcess = await processWebhookEvent({
      eventId,
      platform: "WHATSAPP",
    });

    if (!shouldProcess) {
      console.log("[WHATSAPP WEBHOOK] duplicate webhook ignored");
      return res.sendStatus(200);
    }

    const from = message.from;
    const phoneNumberId =
      body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    const phoneNumberIds = [normalizeIdentifier(phoneNumberId)].filter(
      (value): value is string => Boolean(value)
    );

    if (!from || !phoneNumberIds.length) {
      return res.sendStatus(200);
    }

    console.log("[WHATSAPP WEBHOOK] identifiers", {
      phoneNumberIds,
    });

    const client = await findWhatsAppClient({
      phoneNumberIds,
    });

    if (!client) {
      console.log("[WHATSAPP WEBHOOK] client not found");
      return res.sendStatus(200);
    }

    attachResolvedBusinessContext(req, client);
    const lead = await resolveOrCreateReceptionLead({
      businessId: client.businessId,
      clientId: client.id,
      adapter: "WHATSAPP",
      payload: {
        ...body.entry?.[0]?.changes?.[0]?.value,
        receivedAt: new Date().toISOString(),
      },
    });
    const intake = await receiveInboundInteraction({
      businessId: client.businessId,
      leadId: lead.id,
      clientId: client.id,
      adapter: "WHATSAPP",
      payload: {
        ...body.entry?.[0]?.changes?.[0]?.value,
        receivedAt: new Date().toISOString(),
      },
      providerMessageIdHint: eventId || null,
      correlationId: req.requestId || eventId,
      traceId: req.requestId || eventId || null,
      metadata: {
        webhook: "whatsapp",
        requestId: req.requestId,
        phoneNumberId: phoneNumberIds[0],
      },
    });

    console.log("[WHATSAPP WEBHOOK] canonical interaction received", {
      businessId: client.businessId,
      leadId: lead.id,
      interactionId: intake.interaction.id,
      externalInteractionKey: intake.interaction.externalInteractionKey,
    });

    return res.sendStatus(200);
  } catch (error) {
    req.logger?.error({ error }, "WhatsApp webhook error");
    captureExceptionWithContext(error, {
      tags: {
        webhook: "whatsapp",
      },
    });

    console.error("[WHATSAPP WEBHOOK] error:", error);
    return res.sendStatus(500);
  }
});

export default router;
