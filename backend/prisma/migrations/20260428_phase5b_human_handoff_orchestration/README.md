Phase 5B human handoff orchestration rollout for Prisma Mongo.

This project uses Prisma with MongoDB, so Prisma Migrate does not generate SQL
migration files for these schema changes. This checked-in artifact records the
authority and index delta that must be rolled out with `npx prisma db push`
after review.

Schema changes in this rollout:
- Added `HumanRoleCapability` as the canonical role authority per business.
- Added `HumanAvailabilityState` as the canonical per-human load/availability
  authority.
- Added `HumanTakeoverLedger` immutable append-only takeover ledger authority.
- Added `HumanEscalationRule` canonical escalation ladder policy authority.
- Added `HumanAvailabilityStatus` enum and supporting relations/indexes across
  `Business`, `Lead`, and `InboundInteraction`.

Rollout command:

```bash
npm run prisma:generate
npm run prisma:db:push
```
