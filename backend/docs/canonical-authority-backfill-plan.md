# Canonical Authority Backfill Plan

Legacy runtime writers are being cut over to the following canonical truth
models:

- outbound attribution and delivery truth: `RevenueTouchLedger`
- consent authority: `ConsentLedger`
- autonomous opportunity authority: `AutonomousOpportunity`
- control-plane cancellation authority: `LeadControlState`
- cap accounting authority: `AutonomousCapReservation`
- durable domain event authority: `EventOutbox`

## Execution Order

1. Freeze new dual-writes by deploying the runtime patch that writes only to the
   new truth models.
2. Backfill legacy records into the new truth models idempotently, oldest first.
3. Verify row/index counts and spot-check resolver queries.
4. Remove legacy runtime readers after the backfill window is complete.

## Mapping

### `SalesMessageTracking` -> `RevenueTouchLedger`

- Canonical key: `outboundKey`
- Populate:
  - `businessId`, `leadId`, `clientId`, `messageId`
  - `touchType` from `messageType`
  - `touchReason` from `source` plus metadata trigger/reason
  - `channel` from metadata/platform fallback to `lead.platform`
  - `actor` from `message.sender`
  - `source`, `traceId`, `cta`, `angle`, `leadState`, `messageType`, `metadata`
  - `confirmedAt` and `deliveredAt` from `sentAt`
  - `deliveryState = "DELIVERED"`
- Derive `outboundKey` deterministically:
  - preferred: `metadata.deliveryJobKey`
  - fallback: `legacy:tracking:{tracking.id}`
- Preserve provider identifiers only when present in message metadata.

### `ConversionEvent` linkage

- For each conversion event with `trackingId` and no `touchLedgerId`, resolve the
  matching `RevenueTouchLedger` row by:
  - exact `messageId`, else
  - exact `outboundKey = legacy:tracking:{trackingId}`
- Set `touchLedgerId` without changing the conversion payload.
- Keep `trackingId` during the transition for auditability, but treat
  `touchLedgerId` as canonical.

### Existing outbound `Message` rows without tracking

- Backfill only outbound messages where `sender in ("AI", "AGENT")`.
- Use `metadata.deliveryJobKey` when present to derive `outboundKey`.
- Otherwise derive `outboundKey = legacy:message:{message.id}`.
- Mark `deliveryState` from message metadata:
  - delivered -> `DELIVERED`
  - failed -> `FAILED`
  - unknown -> `CONFIRMED`

### Lead control state

- Upsert one `LeadControlState` per lead.
- Initialize `cancelTokenVersion = 0` when absent.
- Seed `lastManualOutboundAt` from the latest manual outbound `Message.sender = "AGENT"`.
- Seed `lastHumanTakeoverAt` from the latest audit/control event if available;
  otherwise leave null.

### Consent

- Backfill only explicit opt-in / opt-out evidence into `ConsentLedger`.
- Latest row by `channel + scope` becomes the canonical authority decision.
- Do not synthesize fake consent when the source system lacks evidence; leave the
  channel in `UNKNOWN` state and let the resolver report that.

### Autonomous opportunities

- Preserve every existing row as immutable history.
- Compute and backfill `fingerprintKey` from the normalized opportunity
  fingerprint payload; fallback to `legacy:{id}` when the fingerprint cannot be
  reconstructed.
- For each lead + engine chain, sort by `recommendedAt`, link supersede order by
  setting older rows' `supersededBy` and `supersededAt`, and leave the newest row
  active.

### Cap reservations

- Backfill only currently queued/dispatched autonomous campaigns into
  `AutonomousCapReservation`.
- Use deterministic reservation keys:
  - `autonomous:{campaign.id}:touch_cap`
- Mark:
  - `RESERVED` for queued-but-undispatched campaigns
  - `CONSUMED` for dispatched campaigns
  - `RELEASED` for terminal failed/cancelled campaigns

### Durable outbox

- Backfill only events that still need durable replay.
- Use existing stable event ids as `dedupeKey`.
- Mark `publishedAt` only after the consumer checkpoint set is complete.

## Verification Queries

- `RevenueTouchLedger.count >= outbound legacy tracking count`
- every post-cutover `ConversionEvent` has `touchLedgerId`
- every lead with queued followups has a `LeadControlState`
- only one unsuperseded `AutonomousOpportunity` exists per lead + engine
- no `AutonomousCapReservation` exceeds rule counts inside the same lock window

## Cutover Rule

After the backfill completes, all attribution, control, consent, autonomous cap,
and durable event readers must resolve from the new truth models first. Legacy
tables remain audit-only until deletion.
