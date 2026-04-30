# Phase 5A Integration Harness

This suite runs real HTTP + Prisma + BullMQ + outbox integration validation.

## Runtime model

- Real app bootstrap through `src/app.ts` middleware and route mounting.
- Real lifecycle init through `src/runtime/lifecycle.ts`:
  - `initRedis`
  - `initQueues`
  - `initWorkers` (reception runtime + revenue brain event worker)
- Real HTTP calls via a live ephemeral server and `fetch`.
- Real Prisma writes/reads against an isolated MongoDB database URL.
- Real BullMQ queue/worker processing with namespaced Redis keys.

## Configuration

Use `backend/.env.integration.example` as a template.

Required:

- `INTEGRATION_DATABASE_URL`
- `INTEGRATION_REDIS_URL`

Optional:

- `INTEGRATION_RUN_ID`
- `INTEGRATION_QUEUE_PREFIX`
- `INTEGRATION_META_APP_SECRET`
- `INTEGRATION_SKIP_SCHEMA_PUSH=true` (smoke/debug only)

## Run

```bash
npm run test:integration
```

Primary gate:

- `npm test` now runs integration first, then legacy suites.

## Suites

- `inbound.e2e.test`
- `inbound.replay.e2e.test`
- `malformed.failclosed.e2e.test`
- `consent.block.e2e.test`
- `human.takeover.e2e.test`
- `revenue.bridge.e2e.test`
- `worker.retry.replay.e2e.test`
- `sla.leader.e2e.test`
- `resolution.reopen.e2e.test`
- `dashboard.projection.e2e.test`
- `concurrency.duplicate.e2e.test`
- `outbox.flow.e2e.test`
- `failure.injection.e2e.test`
