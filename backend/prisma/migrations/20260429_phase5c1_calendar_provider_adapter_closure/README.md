# Phase 5C.1 - Global Calendar Provider Adapter Closure

This migration extends the existing Phase 5C booking authorities without forking schema.

## CalendarConnection extensions

- Added operational metadata fields for enterprise provider lifecycle:
  - `providerAccountId`
  - `externalCalendarId`
  - `status`
  - `scopes`
  - `watchChannelId`
  - `watchResourceId`
  - `watchExpiresAt`
  - `lastWatchRenewedAt`
  - `authFailedAt`
  - `permissionRevokedAt`
  - `lastSyncedAt`
  - `metadata`

## CalendarSyncStatus extensions

Added monotonic sync states used by the async provider execution worker:

- `SYNCING`
- `RETRYING`
- `CANCELLED`

Existing canonical authorities remain unchanged:

- `AppointmentLedger`
- `AvailabilitySlot`
- `SlotReservationLedger`
- `AppointmentPolicy`
- `WaitlistLedger`
- `CalendarSyncLedger`
- `MeetingArtifactLedger`
- `AppointmentReminderLedger`

## Additional canonical authorities (Phase 5C.1 closure hardening)

- `CalendarProviderCredential`
  - canonical provider auth state (encrypted token refs, scope, expiry, revocation, status, provider metadata).
  - unique authority per `businessId + provider`.

- `ExternalSyncIdempotency`
  - canonical replay/idempotency state for provider sync and webhook reconciliation.
  - unique `externalSyncKey` + unique `externalWebhookKey`.
  - persisted `providerEventVersion` and `processedAt`.

- `ManualCalendarOverride`
  - canonical manual lock window authority for deterministic provider arbitration.
  - provider sync honors active override windows by priority and expiry.
