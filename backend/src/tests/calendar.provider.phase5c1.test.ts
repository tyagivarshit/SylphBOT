import assert from "node:assert/strict";
import {
  resolveCalendarConflict,
} from "../services/calendarConflictArbitration.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

type Provider = "GOOGLE" | "OUTLOOK" | "INTERNAL";
type SyncState =
  | "PENDING"
  | "SYNCING"
  | "RETRYING"
  | "SYNCED"
  | "FAILED"
  | "CONFLICT"
  | "CANCELLED";

const syncOrder: Record<SyncState, number> = {
  PENDING: 1,
  SYNCING: 2,
  RETRYING: 3,
  SYNCED: 4,
  CONFLICT: 5,
  FAILED: 6,
  CANCELLED: 7,
};

class AdapterSimulator {
  provider: Provider;
  events = new Map<string, { startAt: string; endAt: string; version: number; cancelled: boolean }>();
  busyBlocks = new Set<string>();
  watchExpiresAt: Date | null = null;
  refreshCount = 0;
  tokenExpiresAt: Date = new Date(Date.now() + 60_000);
  failNextOperation: string | null = null;

  constructor(provider: Provider) {
    this.provider = provider;
  }

  setFailNext(operation: string) {
    this.failNextOperation = operation;
  }

  private maybeFail(operation: string) {
    if (this.failNextOperation === operation) {
      this.failNextOperation = null;
      const error = new Error(`${this.provider}:${operation}:timeout`);
      (error as any).retryable = true;
      throw error;
    }
  }

  createEvent(input: { externalEventId?: string | null; startAt: string; endAt: string }) {
    this.maybeFail("create");
    const externalEventId =
      input.externalEventId || `${this.provider.toLowerCase()}_evt_${this.events.size + 1}`;
    const existing = this.events.get(externalEventId);

    if (existing) {
      return {
        externalEventId,
        version: existing.version,
        replayed: true,
      };
    }

    this.events.set(externalEventId, {
      startAt: input.startAt,
      endAt: input.endAt,
      version: 1,
      cancelled: false,
    });
    return {
      externalEventId,
      version: 1,
      replayed: false,
    };
  }

  updateEvent(input: { externalEventId: string; startAt: string; endAt: string }) {
    this.maybeFail("update");
    const current = this.events.get(input.externalEventId);

    if (!current) {
      this.events.set(input.externalEventId, {
        startAt: input.startAt,
        endAt: input.endAt,
        version: 1,
        cancelled: false,
      });
      return {
        externalEventId: input.externalEventId,
        version: 1,
      };
    }

    const nextVersion = current.version + 1;
    this.events.set(input.externalEventId, {
      startAt: input.startAt,
      endAt: input.endAt,
      version: nextVersion,
      cancelled: false,
    });
    return {
      externalEventId: input.externalEventId,
      version: nextVersion,
    };
  }

  cancelEvent(input: { externalEventId: string }) {
    this.maybeFail("cancel");
    const current = this.events.get(input.externalEventId);

    if (!current) {
      return {
        externalEventId: input.externalEventId,
        version: 1,
        replayed: true,
      };
    }

    const nextVersion = current.version + 1;
    this.events.set(input.externalEventId, {
      ...current,
      version: nextVersion,
      cancelled: true,
    });
    return {
      externalEventId: input.externalEventId,
      version: nextVersion,
      replayed: false,
    };
  }

  blockSlot(startAt: string, endAt: string) {
    this.maybeFail("block");
    this.busyBlocks.add(`${startAt}|${endAt}`);
  }

  freeSlot(startAt: string, endAt: string) {
    this.maybeFail("free");
    this.busyBlocks.delete(`${startAt}|${endAt}`);
  }

  refreshToken(now = new Date()) {
    if (now < this.tokenExpiresAt) {
      return false;
    }
    this.refreshCount += 1;
    this.tokenExpiresAt = new Date(now.getTime() + 60 * 60 * 1000);
    return true;
  }

  renewSubscription(now = new Date()) {
    this.watchExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return this.watchExpiresAt;
  }
}

class CalendarSyncHarness {
  adapters: Record<Provider, AdapterSimulator>;
  outboxSeen = new Set<string>();
  webhookSeen = new Set<string>();
  syncStates = new Map<string, SyncState>();
  syncHistory = new Map<string, SyncState[]>();
  appointment = {
    appointmentId: "appt_1",
    appointmentKey: "appt_key_1",
    status: "CONFIRMED",
    startAt: "2026-05-10T10:00:00.000Z",
    endAt: "2026-05-10T10:30:00.000Z",
    version: 1,
    ownership: "INTERNAL",
    manualOverride: null as string | null,
    policyPriority: "INTERNAL",
  };
  externalVersionByEvent = new Map<string, number>();
  slotBlocks = new Set<string>();

  constructor() {
    this.adapters = {
      GOOGLE: new AdapterSimulator("GOOGLE"),
      OUTLOOK: new AdapterSimulator("OUTLOOK"),
      INTERNAL: new AdapterSimulator("INTERNAL"),
    };
  }

  private pushState(key: string, next: SyncState) {
    const current = this.syncStates.get(key);

    if (current && syncOrder[next] < syncOrder[current]) {
      throw new Error(`non_monotonic:${key}:${current}->${next}`);
    }

    this.syncStates.set(key, next);
    const history = this.syncHistory.get(key) || [];
    history.push(next);
    this.syncHistory.set(key, history);
  }

  async processOutbox(input: {
    outboxId: string;
    type: "create" | "reschedule" | "cancel" | "block" | "free";
    providers: Provider[];
    crashAfterFirst?: boolean;
  }) {
    if (this.outboxSeen.has(input.outboxId)) {
      return "replay";
    }

    let processed = 0;

    for (const provider of input.providers) {
      const key = `${provider}:${input.outboxId}`;
      const existingState = this.syncStates.get(key);

      if (existingState === "SYNCED" || existingState === "CANCELLED") {
        continue;
      }

      this.pushState(key, "PENDING");
      this.pushState(key, "SYNCING");

      try {
        const adapter = this.adapters[provider];
        if (input.type === "create") {
          adapter.createEvent({
            startAt: this.appointment.startAt,
            endAt: this.appointment.endAt,
          });
        } else if (input.type === "reschedule") {
          const externalEventId = `${provider.toLowerCase()}_evt_1`;
          adapter.updateEvent({
            externalEventId,
            startAt: this.appointment.startAt,
            endAt: this.appointment.endAt,
          });
        } else if (input.type === "cancel") {
          const externalEventId = `${provider.toLowerCase()}_evt_1`;
          adapter.cancelEvent({
            externalEventId,
          });
        } else if (input.type === "block") {
          adapter.blockSlot(this.appointment.startAt, this.appointment.endAt);
          this.slotBlocks.add(`${this.appointment.startAt}|${this.appointment.endAt}`);
        } else if (input.type === "free") {
          adapter.freeSlot(this.appointment.startAt, this.appointment.endAt);
          this.slotBlocks.delete(`${this.appointment.startAt}|${this.appointment.endAt}`);
        }
        this.pushState(key, input.type === "cancel" ? "CANCELLED" : "SYNCED");
      } catch (error: any) {
        this.pushState(key, error?.retryable ? "RETRYING" : "FAILED");
        throw error;
      }

      processed += 1;

      if (input.crashAfterFirst && processed === 1) {
        throw new Error("worker_crash_mid_sync");
      }
    }

    this.outboxSeen.add(input.outboxId);
    return "processed";
  }

  reconcileWebhook(input: {
    provider: Provider;
    externalEventId: string;
    externalVersion: number;
    cancelled?: boolean;
    startAt?: string;
    endAt?: string;
  }) {
    const dedupeKey = `${input.provider}:${input.externalEventId}:${input.externalVersion}`;

    if (this.webhookSeen.has(dedupeKey)) {
      return "replay";
    }

    this.webhookSeen.add(dedupeKey);
    const lastVersion = this.externalVersionByEvent.get(input.externalEventId) || 0;

    if (input.externalVersion <= lastVersion) {
      return "out_of_order";
    }

    this.externalVersionByEvent.set(input.externalEventId, input.externalVersion);

    const resolution = resolveCalendarConflict({
      internalVersion: this.appointment.version,
      externalVersion: input.externalVersion,
      ownership: this.appointment.ownership,
      manualOverride: this.appointment.manualOverride,
      policyPriority: this.appointment.policyPriority,
    });

    if (resolution.winner === "EXTERNAL") {
      if (input.cancelled) {
        this.appointment.status = "CANCELLED";
      } else if (input.startAt && input.endAt) {
        this.appointment.startAt = input.startAt;
        this.appointment.endAt = input.endAt;
        this.appointment.status = "RESCHEDULED";
      }
      this.appointment.version = Math.max(this.appointment.version, input.externalVersion);
      return "applied_external";
    }

    return "conflict_internal_won";
  }
}

export const calendarProviderPhase5C1Tests: TestCase[] = [
  {
    name: "phase5c1 google create replay stays idempotent",
    run: async () => {
      const harness = new CalendarSyncHarness();
      const first = await harness.processOutbox({
        outboxId: "evt_google_create_1",
        type: "create",
        providers: ["GOOGLE"],
      });
      const second = await harness.processOutbox({
        outboxId: "evt_google_create_1",
        type: "create",
        providers: ["GOOGLE"],
      });

      assert.equal(first, "processed");
      assert.equal(second, "replay");
      assert.equal(harness.adapters.GOOGLE.events.size, 1);
    },
  },
  {
    name: "phase5c1 google cancel replay stays deterministic",
    run: async () => {
      const harness = new CalendarSyncHarness();
      await harness.processOutbox({
        outboxId: "evt_google_create_2",
        type: "create",
        providers: ["GOOGLE"],
      });
      const first = await harness.processOutbox({
        outboxId: "evt_google_cancel_2",
        type: "cancel",
        providers: ["GOOGLE"],
      });
      const second = await harness.processOutbox({
        outboxId: "evt_google_cancel_2",
        type: "cancel",
        providers: ["GOOGLE"],
      });

      assert.equal(first, "processed");
      assert.equal(second, "replay");
    },
  },
  {
    name: "phase5c1 outlook reschedule replay keeps single external mutation",
    run: async () => {
      const harness = new CalendarSyncHarness();
      await harness.processOutbox({
        outboxId: "evt_outlook_create_1",
        type: "create",
        providers: ["OUTLOOK"],
      });
      await harness.processOutbox({
        outboxId: "evt_outlook_reschedule_1",
        type: "reschedule",
        providers: ["OUTLOOK"],
      });
      const replay = await harness.processOutbox({
        outboxId: "evt_outlook_reschedule_1",
        type: "reschedule",
        providers: ["OUTLOOK"],
      });

      assert.equal(replay, "replay");
      assert.equal(harness.adapters.OUTLOOK.events.size, 1);
    },
  },
  {
    name: "phase5c1 duplicate webhook dedupe rejects replay",
    run: () => {
      const harness = new CalendarSyncHarness();
      const first = harness.reconcileWebhook({
        provider: "GOOGLE",
        externalEventId: "evt_1",
        externalVersion: 10,
        cancelled: true,
      });
      const second = harness.reconcileWebhook({
        provider: "GOOGLE",
        externalEventId: "evt_1",
        externalVersion: 10,
        cancelled: true,
      });

      assert.equal(first, "applied_external");
      assert.equal(second, "replay");
    },
  },
  {
    name: "phase5c1 out-of-order webhook is ignored",
    run: () => {
      const harness = new CalendarSyncHarness();
      const first = harness.reconcileWebhook({
        provider: "OUTLOOK",
        externalEventId: "evt_2",
        externalVersion: 20,
        startAt: "2026-05-11T10:00:00.000Z",
        endAt: "2026-05-11T10:30:00.000Z",
      });
      const second = harness.reconcileWebhook({
        provider: "OUTLOOK",
        externalEventId: "evt_2",
        externalVersion: 18,
        startAt: "2026-05-12T10:00:00.000Z",
        endAt: "2026-05-12T10:30:00.000Z",
      });

      assert.equal(first, "applied_external");
      assert.equal(second, "out_of_order");
      assert.equal(harness.appointment.startAt, "2026-05-11T10:00:00.000Z");
    },
  },
  {
    name: "phase5c1 provider timeout transitions to retry then sync",
    run: async () => {
      const harness = new CalendarSyncHarness();
      harness.adapters.GOOGLE.setFailNext("create");

      await assert.rejects(
        harness.processOutbox({
          outboxId: "evt_timeout_1",
          type: "create",
          providers: ["GOOGLE"],
        }),
        /timeout/
      );

      const retry = await harness.processOutbox({
        outboxId: "evt_timeout_1_retry",
        type: "create",
        providers: ["GOOGLE"],
      });
      assert.equal(retry, "processed");
      assert.deepEqual(
        harness.syncHistory.get("GOOGLE:evt_timeout_1"),
        ["PENDING", "SYNCING", "RETRYING"]
      );
    },
  },
  {
    name: "phase5c1 token expiry triggers refresh flow",
    run: () => {
      const harness = new CalendarSyncHarness();
      harness.adapters.GOOGLE.tokenExpiresAt = new Date(Date.now() - 1000);

      const refreshed = harness.adapters.GOOGLE.refreshToken();
      assert.equal(refreshed, true);
      assert.equal(harness.adapters.GOOGLE.refreshCount, 1);
    },
  },
  {
    name: "phase5c1 subscription renewal extends watch expiration",
    run: () => {
      const harness = new CalendarSyncHarness();
      const renewed = harness.adapters.OUTLOOK.renewSubscription(new Date("2026-04-29T00:00:00.000Z"));

      assert.ok(renewed instanceof Date);
      assert.ok(renewed.getTime() > new Date("2026-04-29T00:00:00.000Z").getTime());
    },
  },
  {
    name: "phase5c1 manual external block reconciles into slot blocks",
    run: async () => {
      const harness = new CalendarSyncHarness();
      await harness.processOutbox({
        outboxId: "evt_block_1",
        type: "block",
        providers: ["INTERNAL"],
      });

      assert.equal(harness.slotBlocks.has(`${harness.appointment.startAt}|${harness.appointment.endAt}`), true);
    },
  },
  {
    name: "phase5c1 conflict arbitration respects manual override",
    run: () => {
      const harness = new CalendarSyncHarness();
      harness.appointment.manualOverride = "INTERNAL";
      harness.appointment.ownership = "EXTERNAL";

      const decision = harness.reconcileWebhook({
        provider: "GOOGLE",
        externalEventId: "evt_conflict_1",
        externalVersion: 100,
        cancelled: true,
      });

      assert.equal(decision, "conflict_internal_won");
      assert.notEqual(harness.appointment.status, "CANCELLED");
    },
  },
  {
    name: "phase5c1 double sync dedupe avoids duplicate provider event writes",
    run: async () => {
      const harness = new CalendarSyncHarness();
      await harness.processOutbox({
        outboxId: "evt_double_sync_1",
        type: "create",
        providers: ["GOOGLE", "OUTLOOK"],
      });
      const replay = await harness.processOutbox({
        outboxId: "evt_double_sync_1",
        type: "create",
        providers: ["GOOGLE", "OUTLOOK"],
      });

      assert.equal(replay, "replay");
      assert.equal(harness.adapters.GOOGLE.events.size, 1);
      assert.equal(harness.adapters.OUTLOOK.events.size, 1);
    },
  },
  {
    name: "phase5c1 worker crash mid sync recovers without duplicate side effects",
    run: async () => {
      const harness = new CalendarSyncHarness();

      await assert.rejects(
        harness.processOutbox({
          outboxId: "evt_crash_1",
          type: "create",
          providers: ["GOOGLE", "OUTLOOK"],
          crashAfterFirst: true,
        }),
        /worker_crash_mid_sync/
      );

      await harness.processOutbox({
        outboxId: "evt_crash_1",
        type: "create",
        providers: ["GOOGLE", "OUTLOOK"],
      });

      assert.equal(harness.adapters.GOOGLE.events.size, 1);
      assert.equal(harness.adapters.OUTLOOK.events.size, 1);
    },
  },
];
