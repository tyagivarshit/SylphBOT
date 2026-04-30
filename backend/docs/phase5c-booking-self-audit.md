# AUTOMEXIA PHASE 5C SELF AUDIT

Date: 2026-04-29

## Canonical Authority Models

| Subsystem | Reachable | Bootstrapped | Invoked | Authoritative Write | Read Later | Events Produced | Legacy Bypass | Orphan |
|---|---|---|---|---|---|---|---|---|
| AppointmentLedger | YES | YES | YES | YES | YES | YES | NO | NO |
| AvailabilitySlot | YES | YES | YES | YES | YES | YES | NO | NO |
| SlotReservationLedger | YES | YES | YES | YES | YES | YES | NO | NO |
| AppointmentPolicy | YES | YES | YES | YES | YES | N/A | NO | NO |
| WaitlistLedger | YES | YES | YES | YES | YES | YES | NO | NO |
| CalendarSyncLedger | YES | YES | YES | YES | YES | YES | NO | NO |
| MeetingArtifactLedger | YES | YES | YES | YES | YES | YES | NO | NO |
| AppointmentReminderLedger | YES | YES | YES | YES | YES | YES | NO | NO |

## Runtime Services

| Service | Reachable | Bootstrapped | Invoked | Authoritative | Events Consumed/Produced | Orphan |
|---|---|---|---|---|---|---|
| appointmentEngine.service.ts | YES | YES | YES | YES | Produces appointment.* outbox events | NO |
| availabilityPlanner.service.ts | YES | YES | YES | YES | N/A | NO |
| slotLock.service.ts (extended) | YES | YES | YES | YES | N/A | NO |
| bookingPolicy.service.ts | YES | YES | YES | YES | N/A | NO |
| rescheduleEngine.service.ts | YES | YES | YES | YES | Produces appointment.rescheduled | NO |
| appointmentReminder.service.ts | YES | YES | YES | YES | Produces appointment.reminder_sent | NO |
| meetingState.service.ts | YES | YES | YES | YES | Produces lifecycle events | NO |
| appointmentOutcome.service.ts | YES | YES | YES | YES | Produces completed/followup events | NO |
| noShowRecovery.service.ts | YES | YES | YES | YES | Produces no-show path events | NO |
| waitlistEngine.service.ts | YES | YES | YES | YES | Produces waitlist fill events | NO |
| calendarSync.service.ts | YES | YES | YES | YES | Produces calendar sync events | NO |
| googleCalendarAdapter.service.ts | YES | YES | YES | YES | Adapter boundary only | NO |
| outlookCalendarAdapter.service.ts | YES | YES | YES | YES | Adapter boundary only | NO |
| calendarProviderRouter.service.ts | YES | YES | YES | YES | Routes provider operations deterministically | NO |
| meetingArtifact.service.ts | YES | YES | YES | YES | Produces artifact events | NO |
| appointmentProjection.service.ts | YES | YES | YES | Derived-only | N/A | NO |
| appointmentEvent.service.ts | YES | YES | YES | Durable outbox only | Produces durable outbox envelopes | NO |

## Queues / Workers / Crons

| Component | Reachable | Bootstrapped | Invoked | Replay Safe | Fail Closed |
|---|---|---|---|---|---|
| queues/appointmentOps.queue.ts | YES | YES | YES | YES (stable job ids) | YES |
| workers/appointmentOps.worker.ts | YES | YES | YES | YES | YES |
| cron/appointmentOps.cron.ts | YES | YES | YES | YES | YES |
| queues/calendarSync.queue.ts | YES | YES | YES | YES (outbox checkpoint + job id dedupe) | YES |
| workers/calendarSync.worker.ts | YES | YES | YES | YES | YES |
| cron/calendarSync.cron.ts | YES | YES | YES | YES | YES |
| routes/calendar.webhook.ts | YES | YES | YES | YES (webhook dedupe + version gate) | YES |

## Reception / Routing Wiring

- Reception classifier now detects canonical appointment intents:
  - `BOOK`, `CHECK_AVAILABILITY`, `CONFIRM_SLOT`, `RESCHEDULE`, `CANCEL_BOOKING`, `JOIN_LINK`,
    `RUNNING_LATE`, `CHECK_IN`, `NO_SHOW_RECOVERY`, `FOLLOWUP_BOOKING`, `GROUP_BOOKING`,
    `RECURRING_BOOKING`, `WAITLIST_REQUEST`.
- `APPOINTMENTS` route now executes canonical appointment runtime path in `receptionRuntime.worker.ts`.
- On canonical appointment runtime failure, routing fails closed to human queue with traceable metadata.

## Legacy Bypass Audit

- Legacy booking HTTP endpoints now route through Phase 5C canonical services.
- Legacy `Appointment` model remains mirror/read compatibility layer only.
- New writes for booking lifecycle are centralized in `AppointmentLedger` + companion ledgers.

## Verification

- `npm run prisma:generate` passed.
- `npm run build` passed.
- `node dist/tests/run-tests.js --explicit-exit` passed (97/97), including new Phase 5C mandatory scenarios.
