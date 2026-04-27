import assert from "node:assert/strict";
import prisma from "../config/prisma";
import {
  evaluateLeadControlGate,
  setLeadHumanControl,
} from "../services/leadControlState.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

export const cancelTokenInvalidationTests: TestCase[] = [
  {
    name: "cancel token invalidates queued work after human control toggles",
    run: async () => {
      const originalTransaction = (prisma as any).$transaction;
      const originalLeadFindUnique = (prisma.lead as any).findUnique;
      const originalLeadUpdate = (prisma.lead as any).update;
      const originalLeadControlFindUnique = (prisma.leadControlState as any).findUnique;
      const originalLeadControlUpsert = (prisma.leadControlState as any).upsert;

      const leadRecord = {
        id: "lead_1",
        businessId: "business_1",
        isHumanActive: false,
      };
      let state: any = null;

      try {
        (prisma as any).$transaction = async (runner: any) => runner(prisma as any);
        (prisma.lead as any).findUnique = async ({ where }: any) =>
          where.id === leadRecord.id ? leadRecord : null;
        (prisma.lead as any).update = async ({ data }: any) => {
          Object.assign(leadRecord, data);
          return leadRecord;
        };
        (prisma.leadControlState as any).findUnique = async () => state;
        (prisma.leadControlState as any).upsert = async ({ update, create }: any) => {
          if (!state) {
            state = {
              businessId: create.businessId,
              leadId: create.leadId,
              cancelTokenVersion: create.cancelTokenVersion ?? 0,
              manualSuppressUntil: create.manualSuppressUntil || null,
              lastManualOutboundAt: create.lastManualOutboundAt || null,
              lastHumanTakeoverAt: create.lastHumanTakeoverAt || null,
            };
          } else {
            state = {
              ...state,
              cancelTokenVersion:
                state.cancelTokenVersion +
                Number(update.cancelTokenVersion?.increment || 0),
              manualSuppressUntil:
                update.manualSuppressUntil !== undefined
                  ? update.manualSuppressUntil
                  : state.manualSuppressUntil,
              lastManualOutboundAt:
                update.lastManualOutboundAt !== undefined
                  ? update.lastManualOutboundAt
                  : state.lastManualOutboundAt,
              lastHumanTakeoverAt:
                update.lastHumanTakeoverAt !== undefined
                  ? update.lastHumanTakeoverAt
                  : state.lastHumanTakeoverAt,
            };
          }

          return state;
        };

        await setLeadHumanControl({
          leadId: "lead_1",
          businessId: "business_1",
          isActive: true,
          changedAt: new Date("2026-04-27T12:00:00.000Z"),
        });
        const deactivated = await setLeadHumanControl({
          leadId: "lead_1",
          businessId: "business_1",
          isActive: false,
          changedAt: new Date("2026-04-27T12:05:00.000Z"),
        });
        const gate = await evaluateLeadControlGate({
          leadId: "lead_1",
          expectedCancelTokenVersion: 1,
          now: new Date("2026-04-27T12:05:01.000Z"),
        });

        assert.equal(deactivated.cancelTokenVersion, 2);
        assert.equal(gate.allowed, false);
        assert.equal(gate.reason, "cancel_token_stale");
        assert.equal(leadRecord.isHumanActive, false);
      } finally {
        (prisma as any).$transaction = originalTransaction;
        (prisma.lead as any).findUnique = originalLeadFindUnique;
        (prisma.lead as any).update = originalLeadUpdate;
        (prisma.leadControlState as any).findUnique = originalLeadControlFindUnique;
        (prisma.leadControlState as any).upsert = originalLeadControlUpsert;
      }
    },
  },
];
