import assert from "node:assert/strict";
import prisma from "../config/prisma";
import { reconcileRevenueTouchDeliveryByProviderMessageId } from "../services/revenueTouchLedger.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

export const webhookReconciliationTests: TestCase[] = [
  {
    name: "webhook reconciliation marks delivered exactly once for duplicate callbacks",
    run: async () => {
      const originalTouchFindUnique = (prisma.revenueTouchLedger as any).findUnique;
      const originalTouchUpdate = (prisma.revenueTouchLedger as any).update;
      const originalMessageFindUnique = (prisma.message as any).findUnique;
      const originalMessageUpdate = (prisma.message as any).update;

      const touch = {
        id: "touch_1",
        businessId: "business_1",
        leadId: "lead_1",
        clientId: "client_1",
        messageId: "message_1",
        touchType: "AI_REPLY",
        touchReason: "conversation_send",
        channel: "WHATSAPP",
        actor: "AI",
        source: "AI_ROUTER",
        traceId: "trace_1",
        providerMessageId: "wamid_1",
        outboundKey: "AI_ROUTER:lead_1:job_1",
        deliveryState: "CONFIRMED",
        campaignId: null,
        conversionWindowEndsAt: null,
        providerAcceptedAt: new Date("2026-04-27T12:00:00.000Z"),
        providerMessagePersistedAt: new Date("2026-04-27T12:00:01.000Z"),
        confirmedAt: new Date("2026-04-27T12:00:02.000Z"),
        deliveredAt: null,
        failedAt: null,
        cta: null,
        angle: null,
        leadState: null,
        messageType: "AI_REPLY",
        metadata: {
          outboundKey: "AI_ROUTER:lead_1:job_1",
          providerMessageId: "wamid_1",
        },
      };
      const message = {
        id: "message_1",
        metadata: {
          outboundKey: "AI_ROUTER:lead_1:job_1",
          providerMessageId: "wamid_1",
          delivery: {
            status: "CONFIRMED",
          },
        },
      };

      try {
        (prisma.revenueTouchLedger as any).findUnique = async ({ where }: any) => {
          if (
            where.providerMessageId === "wamid_1" ||
            where.outboundKey === touch.outboundKey
          ) {
            return touch;
          }

          return null;
        };
        (prisma.revenueTouchLedger as any).update = async ({ data }: any) => {
          Object.assign(touch, data);
          return touch;
        };
        (prisma.message as any).findUnique = async ({ where }: any) =>
          where.id === "message_1" ? message : null;
        (prisma.message as any).update = async ({ data }: any) => {
          Object.assign(message, data);
          return message;
        };

        await reconcileRevenueTouchDeliveryByProviderMessageId({
          providerMessageId: "wamid_1",
          deliveredAt: new Date("2026-04-27T12:05:00.000Z"),
        });
        await reconcileRevenueTouchDeliveryByProviderMessageId({
          providerMessageId: "wamid_1",
          deliveredAt: new Date("2026-04-27T12:06:00.000Z"),
        });

        assert.equal(touch.deliveryState, "DELIVERED");
        assert.equal(
          (message.metadata as any).delivery.status,
          "DELIVERED"
        );
        assert.equal((message.metadata as any).providerMessageId, "wamid_1");
      } finally {
        (prisma.revenueTouchLedger as any).findUnique = originalTouchFindUnique;
        (prisma.revenueTouchLedger as any).update = originalTouchUpdate;
        (prisma.message as any).findUnique = originalMessageFindUnique;
        (prisma.message as any).update = originalMessageUpdate;
      }
    },
  },
];
