# Phase 2B Prisma Mongo Rollout

Apply the Phase 2B CRM hardening rollout in this order:

1. Generate the Prisma client:

```bash
npm run prisma:generate
```

2. Push the Mongo schema and indexes:

```bash
npm run prisma:db:push
```

3. Validate that Phase 2B indexes exist after the push:

- `Lead.businessId + lastBookedAt`
- `Lead.businessId + lastConvertedAt`
- `Lead.businessId + intelligenceUpdatedAt`
- `LeadIntelligenceProfile.businessId + lastSyncedAt`
- `CustomerRelationship.businessId + relationshipType`

4. Restart API and workers after the push so the new CRM refresh queue and cached intelligence profile logic run against the updated client.

5. Watch the first rollout window for:

- `CRM intelligence profile synced`
- `CRM_INTELLIGENCE_FAILED`
- unexpected refresh fan-out for the same `leadId`

Notes:

- `db push` is the intended rollout path here because this project uses Prisma with Mongo.
- The relationship edge persistence and intelligence profile cache are backward compatible with older records, but the new metrics payload is only populated after a fresh Phase 2B sync.
