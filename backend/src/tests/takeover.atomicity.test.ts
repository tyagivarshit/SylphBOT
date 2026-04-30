import assert from "node:assert/strict";
import { createTakeoverLedgerService } from "../services/takeoverLedger.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

type Store = {
  interaction: any;
  queue: any;
  leadControl: any;
  lead: any;
  takeoverLedger: any[];
  revenueTouchByKey: Map<string, any>;
  receptionMemory: any | null;
};

const createTestStore = (): Store => ({
  interaction: {
    id: "interaction_1",
    businessId: "business_1",
    leadId: "lead_1",
    assignedQueueId: "queue_1",
    assignedHumanId: null,
    metadata: {},
    lifecycleState: "ROUTED",
  },
  queue: {
    id: "queue_1",
    businessId: "business_1",
    interactionId: "interaction_1",
    leadId: "lead_1",
    assignedRole: "REP",
    assignedHumanId: null,
    state: "ASSIGNED",
    resolutionCode: null,
    metadata: {},
  },
  leadControl: {
    businessId: "business_1",
    leadId: "lead_1",
    cancelTokenVersion: 0,
    manualSuppressUntil: null,
    lastHumanTakeoverAt: null,
    metadata: {},
  },
  lead: {
    id: "lead_1",
    isHumanActive: false,
  },
  takeoverLedger: [],
  revenueTouchByKey: new Map(),
  receptionMemory: null,
});

const createMockDb = (store: Store) => {
  const buildDelegates = (state: Store) => ({
    inboundInteraction: {
      findUnique: async ({ where, select }: any) => {
        if (where?.id !== state.interaction.id) {
          return null;
        }

        const row = { ...state.interaction };
        if (!select) {
          return row;
        }

        return Object.keys(select).reduce((result: any, key) => {
          if (select[key]) {
            result[key] = row[key];
          }
          return result;
        }, {});
      },
      update: async ({ where, data }: any) => {
        if (where?.id !== state.interaction.id) {
          throw new Error("interaction_not_found");
        }
        state.interaction = {
          ...state.interaction,
          ...data,
          metadata: data.metadata ?? state.interaction.metadata,
          lifecycleState: data.lifecycleState ?? state.interaction.lifecycleState,
        };
        return { ...state.interaction };
      },
    },
    humanWorkQueue: {
      findUnique: async ({ where, select }: any) => {
        if (where?.id !== state.queue.id) {
          return null;
        }
        const row = { ...state.queue };
        if (!select) {
          return row;
        }
        return Object.keys(select).reduce((result: any, key) => {
          if (select[key]) {
            result[key] = row[key];
          }
          return result;
        }, {});
      },
      update: async ({ where, data }: any) => {
        if (where?.id !== state.queue.id) {
          throw new Error("queue_not_found");
        }
        state.queue = {
          ...state.queue,
          ...data,
          metadata: data.metadata ?? state.queue.metadata,
        };
        return { ...state.queue };
      },
    },
    humanTakeoverLedger: {
      create: async ({ data, select }: any) => {
        const row = {
          id: `ledger_${state.takeoverLedger.length + 1}`,
          ...data,
        };
        state.takeoverLedger.push(row);
        if (!select) {
          return row;
        }
        return Object.keys(select).reduce((result: any, key) => {
          if (select[key]) {
            result[key] = row[key];
          }
          return result;
        }, {});
      },
      findFirst: async () => {
        const last = state.takeoverLedger[state.takeoverLedger.length - 1];
        if (!last) {
          return null;
        }
        return {
          acceptedAt: last.acceptedAt || null,
          assignedTo: last.assignedTo || null,
        };
      },
    },
    leadControlState: {
      findUnique: async () => state.leadControl,
      upsert: async ({ update, create, select }: any) => {
        const exists = Boolean(state.leadControl);
        const increment = Number(update?.cancelTokenVersion?.increment || 0);
        state.leadControl = exists
          ? {
              ...state.leadControl,
              ...update,
              cancelTokenVersion: state.leadControl.cancelTokenVersion + increment,
            }
          : {
              ...create,
            };
        if (!select) {
          return state.leadControl;
        }
        return Object.keys(select).reduce((result: any, key) => {
          if (select[key]) {
            result[key] = state.leadControl[key];
          }
          return result;
        }, {});
      },
    },
    lead: {
      update: async ({ data }: any) => {
        state.lead = {
          ...state.lead,
          ...data,
        };
        return state.lead;
      },
    },
    revenueTouchLedger: {
      findUnique: async ({ where }: any) => {
        if (!where?.outboundKey) {
          return null;
        }
        return state.revenueTouchByKey.get(where.outboundKey) || null;
      },
      create: async ({ data, select }: any) => {
        const row = {
          id: `touch_${state.revenueTouchByKey.size + 1}`,
          ...data,
        };
        state.revenueTouchByKey.set(data.outboundKey, row);
        if (!select) {
          return row;
        }
        return Object.keys(select).reduce((result: any, key) => {
          if (select[key]) {
            result[key] = row[key];
          }
          return result;
        }, {});
      },
      update: async ({ where, data, select }: any) => {
        const current = state.revenueTouchByKey.get(where.outboundKey);
        if (!current) {
          throw new Error("touch_not_found");
        }
        const next = {
          ...current,
          ...data,
        };
        state.revenueTouchByKey.set(where.outboundKey, next);
        if (!select) {
          return next;
        }
        return Object.keys(select).reduce((result: any, key) => {
          if (select[key]) {
            result[key] = next[key];
          }
          return result;
        }, {});
      },
    },
    receptionMemory: {
      findUnique: async () => state.receptionMemory,
      upsert: async ({ update, create }: any) => {
        state.receptionMemory = state.receptionMemory
          ? {
              ...state.receptionMemory,
              ...update,
            }
          : {
              ...create,
            };
        return state.receptionMemory;
      },
    },
  });
  const db: any = buildDelegates(store);

  db.$transaction = async (callback: any) => {
    const staged: Store = structuredClone({
      ...store,
      revenueTouchByKey: Array.from(store.revenueTouchByKey.entries()),
    }) as any;
    staged.revenueTouchByKey = new Map(
      (staged as any).revenueTouchByKey as Array<[string, any]>
    );
    const tx = buildDelegates(staged);
    const result = await callback(tx);
    store.interaction = staged.interaction;
    store.queue = staged.queue;
    store.leadControl = staged.leadControl;
    store.lead = staged.lead;
    store.takeoverLedger = staged.takeoverLedger;
    store.revenueTouchByKey = staged.revenueTouchByKey;
    store.receptionMemory = staged.receptionMemory;
    return result;
  };

  return db;
};

export const takeoverAtomicityTests: TestCase[] = [
  {
    name: "takeover open updates control state, queue, and interaction atomically with immutable ledger row",
    run: async () => {
      const store = createTestStore();
      const db = createMockDb(store);
      const service = createTakeoverLedgerService(db);

      const result = await service.openTakeover({
        interactionId: "interaction_1",
        assignedTo: "human_owner",
        reason: "ai_to_human",
        requestedBy: "AI",
      });

      assert.equal(result.cancelTokenVersion, 1);
      assert.equal(store.takeoverLedger.length, 1);
      assert.equal(store.queue.assignedHumanId, "human_owner");
      assert.equal(store.queue.state, "IN_PROGRESS");
      assert.equal(store.interaction.assignedHumanId, "human_owner");
      assert.equal(store.interaction.lifecycleState, "IN_PROGRESS");
      assert.ok(store.leadControl.manualSuppressUntil instanceof Date);
      assert.equal(store.lead.isHumanActive, true);
    },
  },
  {
    name: "human outbound resolution writes canonical revenue touch and closes queue interaction state",
    run: async () => {
      const store = createTestStore();
      const db = createMockDb(store);
      const service = createTakeoverLedgerService(db);

      await service.openTakeover({
        interactionId: "interaction_1",
        assignedTo: "human_owner",
        reason: "ai_to_human",
        requestedBy: "AI",
      });
      const result = await service.recordHumanOutbound({
        interactionId: "interaction_1",
        humanId: "human_owner",
        outboundKey: "human:interaction_1:msg_1",
        content: "Handled and resolved",
        resolutionCode: "RESOLVED_HUMAN",
        resolved: true,
      });

      assert.equal(result.resolved, true);
      assert.equal(store.queue.state, "RESOLVED");
      assert.equal(store.interaction.lifecycleState, "RESOLVED");
      assert.equal(store.revenueTouchByKey.size, 1);
      assert.equal(
        store.revenueTouchByKey.get("human:interaction_1:msg_1")?.actor,
        "HUMAN"
      );
      assert.equal(store.receptionMemory?.unresolvedCount, 0);
    },
  },
];
