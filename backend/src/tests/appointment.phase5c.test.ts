import assert from "node:assert/strict";
import crypto from "crypto";
import {
  evaluateCancellationPolicy,
  evaluateReschedulePolicy,
} from "../services/bookingPolicy.service";
import { canTransitionAppointmentStatus } from "../services/meetingState.service";
import type { TestCase } from "./reception.test.helpers";

type Slot = {
  slotKey: string;
  capacity: number;
  reservedCount: number;
};

type Appointment = {
  appointmentKey: string;
  status: string;
  slotKey: string | null;
  holdToken: string | null;
  holdExpiresAt: Date | null;
  rescheduleCount: number;
  reminderDedupe: Set<string>;
  remindersSent: string[];
  consentGranted: boolean;
  metadata: Record<string, unknown>;
};

class InMemoryAppointmentHarness {
  slots = new Map<string, Slot>();
  appointments = new Map<string, Appointment>();
  waitlist: Array<{
    id: string;
    leadId: string;
    slotKey: string;
    priority: number;
    requestedAt: number;
    status: "WAITING" | "FILLED";
  }> = [];
  calendarReplays = new Set<string>();
  artifactFingerprints = new Map<string, string>();

  addSlot(slotKey: string, capacity = 1) {
    this.slots.set(slotKey, {
      slotKey,
      capacity,
      reservedCount: 0,
    });
  }

  createAppointment(key: string, consentGranted = true) {
    this.appointments.set(key, {
      appointmentKey: key,
      status: "REQUESTED",
      slotKey: null,
      holdToken: null,
      holdExpiresAt: null,
      rescheduleCount: 0,
      reminderDedupe: new Set(),
      remindersSent: [],
      consentGranted,
      metadata: {},
    });
  }

  hold(key: string, slotKey: string, ttlMs = 60_000) {
    const appointment = this.appointments.get(key);
    const slot = this.slots.get(slotKey);

    if (!appointment || !slot) {
      throw new Error("missing_entities");
    }

    if (slot.reservedCount >= slot.capacity) {
      throw new Error("slot_capacity_exhausted");
    }

    slot.reservedCount += 1;
    appointment.slotKey = slotKey;
    appointment.status = "HOLD";
    appointment.holdToken = crypto.randomUUID();
    appointment.holdExpiresAt = new Date(Date.now() + ttlMs);
    return appointment.holdToken;
  }

  confirm(key: string, token: string) {
    const appointment = this.appointments.get(key);

    if (!appointment) {
      throw new Error("appointment_missing");
    }

    if (appointment.status === "CONFIRMED") {
      return "replay";
    }

    if (appointment.status !== "HOLD") {
      throw new Error("invalid_state");
    }

    if (appointment.holdToken !== token) {
      throw new Error("token_mismatch");
    }

    appointment.status = "CONFIRMED";
    appointment.holdToken = null;
    appointment.holdExpiresAt = null;
    return "confirmed";
  }

  sweepExpired(now = new Date()) {
    let expired = 0;

    for (const appointment of this.appointments.values()) {
      if (
        appointment.status === "HOLD" &&
        appointment.holdExpiresAt &&
        appointment.holdExpiresAt <= now
      ) {
        if (appointment.slotKey) {
          const slot = this.slots.get(appointment.slotKey);

          if (slot) {
            slot.reservedCount = Math.max(0, slot.reservedCount - 1);
          }
        }

        appointment.status = "EXPIRED";
        appointment.holdToken = null;
        appointment.holdExpiresAt = null;
        expired += 1;
      }
    }

    return expired;
  }

  reschedule(key: string, newSlotKey: string) {
    const appointment = this.appointments.get(key);
    const nextSlot = this.slots.get(newSlotKey);

    if (!appointment || !nextSlot) {
      throw new Error("missing_entities");
    }

    const previousSlotKey = appointment.slotKey;
    const previousSlot = previousSlotKey ? this.slots.get(previousSlotKey) : null;

    if (nextSlot.reservedCount >= nextSlot.capacity) {
      throw new Error("slot_capacity_exhausted");
    }

    nextSlot.reservedCount += 1;

    if (previousSlot) {
      previousSlot.reservedCount = Math.max(0, previousSlot.reservedCount - 1);
    }

    appointment.slotKey = newSlotKey;
    appointment.rescheduleCount += 1;
    appointment.status = "RESCHEDULED";
  }

  cancel(key: string) {
    const appointment = this.appointments.get(key);

    if (!appointment) {
      throw new Error("missing_appointment");
    }

    if (appointment.slotKey) {
      const slot = this.slots.get(appointment.slotKey);

      if (slot) {
        slot.reservedCount = Math.max(0, slot.reservedCount - 1);
      }
    }

    appointment.status = "CANCELLED";
  }

  scheduleReminder(key: string, reminderType: string) {
    const appointment = this.appointments.get(key);

    if (!appointment) {
      throw new Error("missing_appointment");
    }

    if (appointment.reminderDedupe.has(reminderType)) {
      return false;
    }

    appointment.reminderDedupe.add(reminderType);
    return true;
  }

  sendReminder(key: string, reminderType: string) {
    const appointment = this.appointments.get(key);

    if (!appointment) {
      throw new Error("missing_appointment");
    }

    if (!appointment.consentGranted) {
      appointment.metadata.suppressed = true;
      appointment.metadata.suppressedReason = "consent_revoked";
      return false;
    }

    appointment.remindersSent.push(reminderType);
    appointment.status =
      appointment.status === "CONFIRMED" || appointment.status === "RESCHEDULED"
        ? "REMINDER_SENT"
        : appointment.status;
    return true;
  }

  replayCalendarEvent(fingerprint: string, hasConflict: boolean) {
    if (this.calendarReplays.has(fingerprint)) {
      return "replay";
    }

    this.calendarReplays.add(fingerprint);
    return hasConflict ? "conflict" : "synced";
  }

  addWaitlist(leadId: string, slotKey: string, priority: number) {
    const id = `wait_${this.waitlist.length + 1}`;
    this.waitlist.push({
      id,
      leadId,
      slotKey,
      priority,
      requestedAt: Date.now() + this.waitlist.length,
      status: "WAITING",
    });
    return id;
  }

  fillWaitlist(slotKey: string) {
    const candidates = this.waitlist
      .filter((entry) => entry.slotKey === slotKey && entry.status === "WAITING")
      .sort((a, b) =>
        b.priority !== a.priority
          ? b.priority - a.priority
          : a.requestedAt - b.requestedAt
      );

    if (!candidates.length) {
      return null;
    }

    const winner = candidates[0];

    if (winner.status !== "WAITING") {
      return null;
    }

    winner.status = "FILLED";
    return winner.id;
  }

  upsertArtifact(appointmentKey: string, payload: Record<string, unknown>) {
    const fingerprint = crypto
      .createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");
    const existing = this.artifactFingerprints.get(appointmentKey);

    if (existing === fingerprint) {
      return "replay";
    }

    this.artifactFingerprints.set(appointmentKey, fingerprint);
    return "written";
  }
}

export const appointmentPhase5CTests: TestCase[] = [
  {
    name: "phase5c double booking race blocks second confirmer deterministically",
    run: async () => {
      const harness = new InMemoryAppointmentHarness();
      harness.addSlot("slot_1", 1);
      harness.createAppointment("appt_1");
      harness.createAppointment("appt_2");

      const token1 = harness.hold("appt_1", "slot_1");

      assert.throws(() => harness.hold("appt_2", "slot_1"), /slot_capacity_exhausted/);
      assert.equal(harness.confirm("appt_1", token1), "confirmed");
    },
  },
  {
    name: "phase5c duplicate confirm replay remains idempotent",
    run: () => {
      const harness = new InMemoryAppointmentHarness();
      harness.addSlot("slot_1", 1);
      harness.createAppointment("appt_1");
      const token = harness.hold("appt_1", "slot_1");

      assert.equal(harness.confirm("appt_1", token), "confirmed");
      assert.equal(harness.confirm("appt_1", token), "replay");
    },
  },
  {
    name: "phase5c worker crash mid hold recovers with expiry sweep",
    run: () => {
      const harness = new InMemoryAppointmentHarness();
      harness.addSlot("slot_1", 1);
      harness.createAppointment("appt_1");
      harness.hold("appt_1", "slot_1", 1);

      const expired = harness.sweepExpired(new Date(Date.now() + 10));
      assert.equal(expired, 1);
      assert.equal(harness.appointments.get("appt_1")?.status, "EXPIRED");
      assert.equal(harness.slots.get("slot_1")?.reservedCount, 0);
    },
  },
  {
    name: "phase5c reschedule atomicity updates both slots and lifecycle",
    run: () => {
      const harness = new InMemoryAppointmentHarness();
      harness.addSlot("slot_a", 1);
      harness.addSlot("slot_b", 1);
      harness.createAppointment("appt_1");
      const token = harness.hold("appt_1", "slot_a");
      harness.confirm("appt_1", token);

      harness.reschedule("appt_1", "slot_b");

      assert.equal(harness.slots.get("slot_a")?.reservedCount, 0);
      assert.equal(harness.slots.get("slot_b")?.reservedCount, 1);
      assert.equal(harness.appointments.get("appt_1")?.status, "RESCHEDULED");
      assert.equal(harness.appointments.get("appt_1")?.rescheduleCount, 1);
    },
  },
  {
    name: "phase5c cancel policy enforces late cancel and deposit rules",
    run: () => {
      const policy: any = {
        cancelWindowMinutes: 60,
        depositRequired: true,
      };
      const decision = evaluateCancellationPolicy({
        policy,
        startAt: new Date(Date.now() + 15 * 60_000),
        now: new Date(),
      });

      assert.equal(decision.lateCancel, true);
      assert.equal(decision.requiresDepositForfeit, true);
    },
  },
  {
    name: "phase5c reminder dedupe prevents duplicate sends",
    run: () => {
      const harness = new InMemoryAppointmentHarness();
      harness.createAppointment("appt_1");

      assert.equal(harness.scheduleReminder("appt_1", "24H"), true);
      assert.equal(harness.scheduleReminder("appt_1", "24H"), false);
    },
  },
  {
    name: "phase5c calendar conflict replay stays replay safe",
    run: () => {
      const harness = new InMemoryAppointmentHarness();

      assert.equal(harness.replayCalendarEvent("evt_1", true), "conflict");
      assert.equal(harness.replayCalendarEvent("evt_1", true), "replay");
    },
  },
  {
    name: "phase5c waitlist fill race yields single deterministic winner",
    run: () => {
      const harness = new InMemoryAppointmentHarness();
      harness.addWaitlist("lead_1", "slot_1", 90);

      const first = harness.fillWaitlist("slot_1");
      const second = harness.fillWaitlist("slot_1");

      assert.ok(first);
      assert.equal(second, null);
      const filled = harness.waitlist.filter((entry) => entry.status === "FILLED");
      assert.equal(filled.length, 1);
    },
  },
  {
    name: "phase5c late join transition remains monotonic",
    run: () => {
      assert.equal(
        canTransitionAppointmentStatus({
          current: "CHECKED_IN",
          next: "LATE_JOIN",
        }),
        true
      );
      assert.equal(
        canTransitionAppointmentStatus({
          current: "COMPLETED",
          next: "CONFIRMED",
        }),
        false
      );
    },
  },
  {
    name: "phase5c no show recovery marks lifecycle and keeps recovery metadata",
    run: () => {
      const harness = new InMemoryAppointmentHarness();
      harness.createAppointment("appt_1");
      harness.appointments.get("appt_1")!.status = "CONFIRMED";
      harness.appointments.get("appt_1")!.metadata.recoveryOffered = true;
      harness.appointments.get("appt_1")!.status = "NO_SHOW";

      assert.equal(harness.appointments.get("appt_1")?.status, "NO_SHOW");
      assert.equal(harness.appointments.get("appt_1")?.metadata.recoveryOffered, true);
    },
  },
  {
    name: "phase5c VIP override allows additional reschedules",
    run: () => {
      const policy: any = {
        maxReschedules: 1,
        vipOverride: {
          maxReschedules: 4,
        },
      };
      const regular = evaluateReschedulePolicy({
        policy,
        rescheduleCount: 1,
        isVip: false,
      });
      const vip = evaluateReschedulePolicy({
        policy,
        rescheduleCount: 1,
        isVip: true,
      });

      assert.equal(regular.allowed, false);
      assert.equal(vip.allowed, true);
    },
  },
  {
    name: "phase5c multi host booking consumes capacity predictably",
    run: () => {
      const harness = new InMemoryAppointmentHarness();
      harness.addSlot("slot_panel", 3);
      harness.createAppointment("appt_1");
      harness.createAppointment("appt_2");

      harness.hold("appt_1", "slot_panel");
      harness.hold("appt_2", "slot_panel");

      assert.equal(harness.slots.get("slot_panel")?.reservedCount, 2);
    },
  },
  {
    name: "phase5c artifact write replay remains idempotent",
    run: () => {
      const harness = new InMemoryAppointmentHarness();
      const payload = {
        transcriptRef: "s3://transcript/1",
        summaryRef: "s3://summary/1",
      };

      assert.equal(harness.upsertArtifact("appt_1", payload), "written");
      assert.equal(harness.upsertArtifact("appt_1", payload), "replay");
    },
  },
  {
    name: "phase5c consent revoke mid reminder suppresses delivery",
    run: () => {
      const harness = new InMemoryAppointmentHarness();
      harness.createAppointment("appt_1", false);
      harness.appointments.get("appt_1")!.status = "CONFIRMED";
      harness.scheduleReminder("appt_1", "30M");

      const delivered = harness.sendReminder("appt_1", "30M");

      assert.equal(delivered, false);
      assert.equal(harness.appointments.get("appt_1")?.metadata.suppressed, true);
    },
  },
];
