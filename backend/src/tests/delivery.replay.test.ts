import assert from "node:assert/strict";
import axios from "axios";
import prisma from "../config/prisma";
import { encrypt } from "../utils/encrypt";
import { persistAndDispatchLeadMessage } from "../services/sendMessage.service";
import * as followupQueue from "../queues/followup.queue";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

export const deliveryReplayTests: TestCase[] = [
  {
    name: "delivery replay does not resend after provider message boundary is durable",
    run: async () => {
      const originalAxiosPost = axios.post;
      const originalCancelFollowups = (followupQueue as any).cancelFollowups;
      const originalMessageCreate = (prisma.message as any).create;
      const originalMessageUpdate = (prisma.message as any).update;
      const originalMessageFindUnique = (prisma.message as any).findUnique;
      const originalLeadUpdate = (prisma.lead as any).update;
      const originalLeadControlUpsert = (prisma.leadControlState as any).upsert;
      const originalRevenueTouchFindUnique = (prisma.revenueTouchLedger as any).findUnique;
      const originalRevenueTouchCreate = (prisma.revenueTouchLedger as any).create;
      const originalRevenueTouchUpdate = (prisma.revenueTouchLedger as any).update;
      const originalConsentFindMany = (prisma.consentLedger as any).findMany;

      const messages = new Map<string, any>();
      const touches = new Map<string, any>();
      let messageCounter = 0;
      let networkCalls = 0;
      let cancelTokenVersion = 0;

      try {
        axios.post = (async () => {
          networkCalls += 1;
          return {
            data: {
              messages: [{ id: `wamid_${networkCalls}` }],
            },
          };
        }) as any;
        (followupQueue as any).cancelFollowups = async () => undefined;
        (prisma.consentLedger as any).findMany = async () => [];
        (prisma.message as any).create = async ({ data }: any) => {
          const record = {
            id: `message_${++messageCounter}`,
            content: data.content,
            sender: data.sender,
            metadata: data.metadata || null,
            leadId: data.lead.connect.id,
          };
          messages.set(record.id, record);
          return record;
        };
        (prisma.message as any).update = async ({ where, data }: any) => {
          const current = messages.get(where.id);
          const updated = {
            ...current,
            ...data,
          };
          messages.set(where.id, updated);
          return updated;
        };
        (prisma.message as any).findUnique = async ({ where }: any) =>
          messages.get(where.id) || null;
        (prisma.lead as any).update = async ({ where, data }: any) => ({
          id: where.id,
          ...data,
        });
        (prisma.leadControlState as any).upsert = async () => ({
          businessId: "business_1",
          leadId: "lead_1",
          cancelTokenVersion: ++cancelTokenVersion,
          manualSuppressUntil: null,
          lastManualOutboundAt: new Date(),
          lastHumanTakeoverAt: null,
        });
        (prisma.revenueTouchLedger as any).findUnique = async ({ where }: any) => {
          if (where.outboundKey) {
            return touches.get(where.outboundKey) || null;
          }

          return (
            Array.from(touches.values()).find(
              (touch) => touch.providerMessageId === where.providerMessageId
            ) || null
          );
        };
        (prisma.revenueTouchLedger as any).create = async ({ data }: any) => {
          const record = {
            id: `touch_${touches.size + 1}`,
            ...data,
          };
          touches.set(record.outboundKey, record);
          return record;
        };
        (prisma.revenueTouchLedger as any).update = async ({ where, data }: any) => {
          const current = touches.get(where.outboundKey);
          const updated = {
            ...current,
            ...data,
          };
          touches.set(where.outboundKey, updated);
          return updated;
        };

        const lead = {
          id: "lead_1",
          businessId: "business_1",
          clientId: "client_1",
          platform: "WHATSAPP",
          phone: "+15555550123",
          client: {
            accessToken: encrypt("token_1"),
            phoneNumberId: "phone_number_1",
            platform: "WHATSAPP",
          },
        };

        await persistAndDispatchLeadMessage({
          lead,
          content: "Manual hello",
          sender: "AGENT",
          clientMessageId: "manual_stable_1",
        });
        await persistAndDispatchLeadMessage({
          lead,
          content: "Manual hello",
          sender: "AGENT",
          clientMessageId: "manual_stable_1",
        });

        const touch = Array.from(touches.values())[0];
        assert.equal(networkCalls, 1);
        assert.ok(touch);
        assert.equal(touch.deliveryState, "CONFIRMED");
        assert.equal(touch.providerMessageId, "wamid_1");
      } finally {
        axios.post = originalAxiosPost;
        (followupQueue as any).cancelFollowups = originalCancelFollowups;
        (prisma.message as any).create = originalMessageCreate;
        (prisma.message as any).update = originalMessageUpdate;
        (prisma.message as any).findUnique = originalMessageFindUnique;
        (prisma.lead as any).update = originalLeadUpdate;
        (prisma.leadControlState as any).upsert = originalLeadControlUpsert;
        (prisma.revenueTouchLedger as any).findUnique = originalRevenueTouchFindUnique;
        (prisma.revenueTouchLedger as any).create = originalRevenueTouchCreate;
        (prisma.revenueTouchLedger as any).update = originalRevenueTouchUpdate;
        (prisma.consentLedger as any).findMany = originalConsentFindMany;
      }
    },
  },
];
