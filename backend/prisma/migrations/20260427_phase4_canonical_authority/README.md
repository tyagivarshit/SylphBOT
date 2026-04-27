Phase 4 canonical authority rollout for Prisma Mongo.

This project uses Prisma with MongoDB, so Prisma Migrate does not generate SQL
migration files for these schema changes. This checked-in artifact records the
intended schema/index delta that must be rolled out with `npx prisma db push`
after review.

Schema changes in this rollout:
- `RevenueTouchLedger.messageId` changed from unique relation authority to a
  non-unique indexed relation.
- `Message.revenueTouchLedgerEntries` changed to a one-to-many relation.
- `ConsentLedger` gained compound resolver indexes for
  `businessId + leadId + channel + scope`.
- `AutonomousOpportunity` gained `fingerprintKey`, `supersededAt`, and lookup
  indexes needed for immutable fingerprint history and supersede chaining.
- `AutonomousCapReservation` gained a compound index for atomic reservation
  window scans.

Rollout command:

```bash
npm run prisma:generate
npm run prisma:db:push
```
