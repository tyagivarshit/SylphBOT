import { Request, Response, Router } from "express";
import prisma from "../config/prisma";
import { enqueueCalendarSyncWebhookJob } from "../queues/calendarSync.queue";
import { normalizeCalendarProvider } from "../services/calendarProvider.contract";

const router = Router();

const normalizeText = (value: unknown) => String(value || "").trim();

const parseDateIso = (value: unknown) => {
  const parsed = new Date(String(value || ""));

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
};

const resolveConnectionByWatch = async ({
  provider,
  watchChannelId,
  watchResourceId,
}: {
  provider: string;
  watchChannelId?: string | null;
  watchResourceId?: string | null;
}) => {
  const where: any = {
    provider: normalizeCalendarProvider(provider),
    status: {
      not: "DISCONNECTED",
    },
  };
  const or = [
    watchChannelId
      ? {
          watchChannelId,
        }
      : null,
    watchResourceId
      ? {
          watchResourceId,
        }
      : null,
  ].filter(Boolean) as any[];

  if (!or.length) {
    return null;
  }

  return prisma.calendarConnection.findFirst({
    where: {
      ...where,
      OR: or,
    },
    select: {
      id: true,
      businessId: true,
      provider: true,
      watchChannelId: true,
      watchResourceId: true,
    },
  });
};

router.get("/google", (_req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    data: {
      verified: true,
    },
  });
});

router.post("/google", async (req: Request, res: Response) => {
  try {
    const channelId = normalizeText(req.headers["x-goog-channel-id"]);
    const resourceId = normalizeText(req.headers["x-goog-resource-id"]);
    const messageNumber = normalizeText(req.headers["x-goog-message-number"]);
    const resourceState = normalizeText(req.headers["x-goog-resource-state"]);
    const externalEventId =
      normalizeText((req.body as any)?.externalEventId) ||
      normalizeText((req.body as any)?.eventId) ||
      resourceId;
    const externalEventVersion =
      normalizeText((req.body as any)?.externalEventVersion) ||
      normalizeText((req.body as any)?.etag) ||
      messageNumber ||
      new Date().toISOString();
    const startAtIso =
      parseDateIso((req.body as any)?.startAtIso) ||
      parseDateIso((req.body as any)?.start?.dateTime) ||
      parseDateIso((req.body as any)?.start);
    const endAtIso =
      parseDateIso((req.body as any)?.endAtIso) ||
      parseDateIso((req.body as any)?.end?.dateTime) ||
      parseDateIso((req.body as any)?.end);
    const connection =
      (await resolveConnectionByWatch({
        provider: "GOOGLE",
        watchChannelId: channelId || null,
        watchResourceId: resourceId || null,
      })) ||
      (normalizeText((req.body as any)?.businessId)
        ? {
            businessId: normalizeText((req.body as any)?.businessId),
            provider: "GOOGLE",
          }
        : null);

    if (!connection || !externalEventId) {
      return res.status(202).json({
        success: true,
        data: {
          queued: false,
          reason: "connection_or_event_missing",
        },
      });
    }

    await enqueueCalendarSyncWebhookJob({
      businessId: connection.businessId,
      provider: normalizeCalendarProvider(connection.provider),
      externalEventId,
      externalUpdatedAtIso: new Date().toISOString(),
      externalEventVersion,
      dedupeFingerprint: [
        "google",
        channelId || "no_channel",
        resourceId || "no_resource",
        messageNumber || "no_message",
        resourceState || "no_state",
      ].join(":"),
      cancelled: resourceState.toLowerCase() === "not_exists",
      startAtIso,
      endAtIso,
      metadata: {
        resourceState,
        channelId: channelId || null,
        resourceId: resourceId || null,
        messageNumber: messageNumber || null,
      },
    });

    return res.status(202).json({
      success: true,
      data: {
        queued: true,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Google calendar webhook failed",
    });
  }
});

router.get("/outlook", (req: Request, res: Response) => {
  const validationToken = normalizeText(req.query.validationToken);

  if (validationToken) {
    res.setHeader("Content-Type", "text/plain");
    return res.status(200).send(validationToken);
  }

  return res.status(200).json({
    success: true,
    data: {
      verified: true,
    },
  });
});

router.post("/outlook", async (req: Request, res: Response) => {
  const validationToken = normalizeText(req.query.validationToken);

  if (validationToken) {
    res.setHeader("Content-Type", "text/plain");
    return res.status(200).send(validationToken);
  }

  try {
    const notifications = Array.isArray((req.body as any)?.value)
      ? ((req.body as any).value as any[])
      : [];

    for (const notification of notifications) {
      const subscriptionId = normalizeText(notification.subscriptionId);
      const clientState = normalizeText(notification.clientState);
      const changeType = normalizeText(notification.changeType).toLowerCase();
      const externalEventId = normalizeText(
        notification.resourceData?.id || notification.id
      );
      const externalEventVersion =
        normalizeText(notification.resourceData?.["@odata.etag"]) ||
        normalizeText(notification.resourceData?.lastModifiedDateTime) ||
        new Date().toISOString();
      const startAtIso = parseDateIso(
        notification.resourceData?.start?.dateTime || notification.resourceData?.start
      );
      const endAtIso = parseDateIso(
        notification.resourceData?.end?.dateTime || notification.resourceData?.end
      );
      const connection =
        (await resolveConnectionByWatch({
          provider: "OUTLOOK",
          watchChannelId: clientState || null,
          watchResourceId: subscriptionId || null,
        })) ||
        (normalizeText(notification.businessId)
          ? {
              businessId: normalizeText(notification.businessId),
              provider: "OUTLOOK",
            }
          : null);

      if (!connection || !externalEventId) {
        continue;
      }

      await enqueueCalendarSyncWebhookJob({
        businessId: connection.businessId,
        provider: normalizeCalendarProvider(connection.provider),
        externalEventId,
        externalUpdatedAtIso:
          parseDateIso(notification.resourceData?.lastModifiedDateTime) ||
          new Date().toISOString(),
        externalEventVersion,
        dedupeFingerprint: [
          "outlook",
          subscriptionId || "no_sub",
          clientState || "no_state",
          externalEventId,
          externalEventVersion,
          changeType || "unknown",
        ].join(":"),
        cancelled: changeType === "deleted",
        startAtIso,
        endAtIso,
        metadata: {
          subscriptionId: subscriptionId || null,
          clientState: clientState || null,
          changeType: changeType || null,
        },
      });
    }

    return res.status(202).json({
      success: true,
      data: {
        queued: true,
        count: notifications.length,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Outlook calendar webhook failed",
    });
  }
});

export default router;
