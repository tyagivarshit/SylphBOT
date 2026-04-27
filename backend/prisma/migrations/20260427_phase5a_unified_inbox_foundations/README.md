Phase 5A unified inbox and AI receptionist foundation rollout for Prisma Mongo.

This project uses Prisma with MongoDB, so Prisma Migrate does not generate SQL
migration files for these schema changes. This checked-in artifact records the
intended schema and index delta that must be rolled out with `npx prisma db push`
after review.

Schema changes in this rollout:
- Added canonical inbound authority via `InboundInteraction`.
- Added single-truth human assignment authority via `HumanWorkQueue`.
- Added persisted receptionist continuity state via `ReceptionMemory`.
- Added canonical enums for inbound channels, interaction types, route targets,
  interaction lifecycle states, queue lifecycle states, and priority levels.
- Added business, lead, and client relations needed to traverse the new inbox
  authorities from existing phase-4 entities.

Rollout command:

```bash
npm run prisma:generate
npm run prisma:db:push
```
