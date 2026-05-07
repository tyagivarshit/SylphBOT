# Sylph-AI Codebase Guide (Hindi + Hinglish)

Updated: 2026-05-06

## 1) Quick Snapshot
- Total files (repo): ~713
- Backend files: ~537
- Frontend files: ~173
- Stack:
  - Frontend: Next.js (App Router), React, TypeScript, React Query, Socket.IO client
  - Backend: Express + TypeScript, Prisma + MongoDB, BullMQ + Redis, Socket.IO, Stripe, Meta webhooks

## 2) Top-Level Folder Meaning
- `backend/`: API server, webhooks, workers, queues, domain services, billing, analytics, automation.
- `frontend/`: Next.js UI, dashboard pages, settings, billing UI, conversations UI.
- `docs/`: human-readable architecture guides (this file included).

## 3) Backend Architecture (How It Runs)

### 3.1 Bootstrap sequence
1. `backend/src/server.ts`
   - Sentry init, Passport init, queue init, worker init, optional cron init.
   - Creates HTTP server and Socket.IO.
   - Handles graceful shutdown.
2. `backend/src/app.ts`
   - Express middleware: security, CORS, compression, cookies, monitoring, request context.
   - Raw-body webhook routes for Meta/Commerce.
   - Mounts all API routes.

### 3.2 Runtime lifecycle
- `backend/src/runtime/lifecycle.ts`
  - Initializes Redis + queues + workers + cron tasks.
  - Closes queues/workers/Redis/Prisma on shutdown.

### 3.3 API route mounts (main)
From `backend/src/app.ts`:
- `/api/auth`
- `/api/dashboard`
- `/api/billing`
- `/api/commerce`
- `/api/usage`
- `/api/help-ai`
- `/api/user`
- `/api/notifications`
- `/api/ai`
- `/api/automation`
- `/api/messages`
- `/api/conversations`
- `/api/comment-triggers`
- `/api/comment-automation/triggers`
- `/api/clients`
- `/api/instagram`
- `/api/knowledge`
- `/api/training`
- `/api/leads`
- `/api/analytics`
- `/api/autonomous`
- `/api/audit`
- `/api/search`
- `/api/security`
- `/api/integrations`
- `/api/oauth`
- `/api/booking`
- `/api/availability`
- `/api/inbox/intake`
- `/api/health`
- Webhooks:
  - `/api/webhook/whatsapp`
  - `/api/webhook/instagram`
  - `/webhook/instagram`
  - `/api/webhook/calendar`
  - `/api/webhooks/commerce`

## 4) Backend Feature Flow (End-to-End)

### 4.1 Auth + session flow
1. Frontend login/register -> `/api/auth/*`.
2. `auth.controller.ts` issues access/refresh cookies.
3. `auth.middleware.ts` validates token, refreshes if needed, binds `req.user` + `req.tenant`.
4. Protected routes work with user business context.

### 4.2 Instagram/WhatsApp inbound to AI reply
1. Webhook received in:
   - `backend/src/routes/instagram.webhook.ts`
   - `backend/src/routes/whatsapp.webhook.ts`
2. Signature + replay + freshness checks (security guard).
3. Resolve client/business mapping.
4. Resolve/create lead (`receptionLead.service.ts`).
5. Canonical intake (`receptionIntake.service.ts`) stores inbound interaction and queues runtime jobs.
6. AI/revenue pipeline eventually enqueues AI queue jobs.
7. `ai.partition.worker.ts` consumes job, checks plan/usage/lock/rate-limit.
8. `executionRouter.servce.ts` -> `aiReplyOrchestrator.service.ts` -> revenue brain / automation / booking.
9. Reply persisted, delivered to platform, tracked in observability/ledger, emitted by sockets.

### 4.3 Reception runtime (canonical intake pipeline)
1. `receiveInboundInteraction()` stores inbound record with dedupe key.
2. Enqueue queue chain in `receptionRuntime.queue.ts`:
   - normalize -> classify -> route -> revenue bridge.
3. `receptionRuntime.worker.ts` applies classifier + route decision:
   - revenue brain
   - human queue
   - appointment handling
4. Lifecycle state transitions and metrics are updated.

### 4.4 Booking flow (canonical)
1. Booking routes in `booking.routes.ts` include request/hold/confirm/reschedule/cancel.
2. Appointment engine + availability planner chooses slots.
3. Booking reminders/ops queues can be triggered.
4. Status + projections exposed to dashboard and ops endpoints.

### 4.5 Billing flow
1. Frontend calls `/api/billing/plans`, `/api/billing/checkout/start` or `/api/billing/create-checkout-session`.
2. Backend billing controller + checkout service create Stripe session.
3. Success callback page confirms checkout via `/api/billing/checkout/confirm`.
4. Subscription context loaded in `subscription.middleware.ts` and enforced by guards.

## 5) Backend Folder-by-Folder Meaning

### 5.1 Core
- `backend/src/server.ts`: process entry + shutdown.
- `backend/src/app.ts`: express app + routes.
- `backend/src/config/*`: env, prisma, redis, passport, plans.
- `backend/src/middleware/*`: auth, rate-limit, api-key, billing attach, feature/subscription guard.

### 5.2 HTTP layer
- `backend/src/routes/*`: endpoint definitions.
- `backend/src/controllers/*`: request handlers + response shaping.

### 5.3 Async processing
- `backend/src/queues/*`: queue definitions + enqueue helpers.
- `backend/src/workers/*`: queue consumers.
- `backend/src/cron/*`: scheduled jobs.

### 5.4 Domain services
- `backend/src/services/*`: business logic (AI, booking, billing, analytics, commerce, security, reliability, SaaS/connect-hub).

### 5.5 Observability & infra
- `backend/src/observability/*`: Sentry/request context/perf metrics.
- `backend/src/sockets/*`: realtime events.
- `backend/src/utils/*`: utility helpers (errors, tokens, encryption, logger).

## 6) Frontend Architecture

### 6.1 Core files
- `frontend/app/layout.tsx`: global layout, providers, toaster, PWA prompt, Facebook SDK.
- `frontend/providers.tsx`: React Query + Auth provider.
- `frontend/context/AuthContext.tsx`: current user bootstrap, auth state, refreshUser.
- `frontend/app/page.tsx`: redirect to dashboard or login.
- `frontend/app/(dashboard)/layout.tsx`: protected shell with sidebar/topbar and upgrade modal context.

### 6.2 Route pages (what each page does)
- `app/(dashboard)/dashboard/page.tsx`: main KPI dashboard + onboarding + usage cards.
- `app/(dashboard)/conversations/page.tsx`: inbox + live messages (Socket.IO).
- `app/(dashboard)/leads/page.tsx`: lead list and filtering.
- `app/(dashboard)/automation/page.tsx`: automation flows list/manage.
- `app/(dashboard)/comment-automation/page.tsx`: comment trigger automation list.
- `app/(dashboard)/ai-training/page.tsx`: training tabs (business, faq, ai settings).
- `app/(dashboard)/knowledge-base/page.tsx`: KB entries CRUD.
- `app/(dashboard)/booking/page.tsx`: booking workspace tabs.
- `app/(dashboard)/booking-calendar/page.tsx`: slot view + appointment creation.
- `app/(dashboard)/analytics/page.tsx`: analytics dashboard (feature gated).
- `app/(dashboard)/autonomous/page.tsx`: autonomous engine dashboard (feature gated).
- `app/(dashboard)/billing/page.tsx`: subscription/plans/checkout management.
- `app/(dashboard)/settings/page.tsx`: business, billing, notification, integration, account settings.
- `app/(dashboard)/settings/security/page.tsx`: security center (api keys, audit, alerts).
- `app/(dashboard)/help/page.tsx`: support/help assistant UI.
- `app/(dashboard)/support/page.tsx`: support page alias.
- `app/(dashboard)/clients/page.tsx`: connected client list and add client.

Auth/public pages:
- `app/auth/login/*`, `register`, `forgot`, `reset-password`, `verify-email`.
- `app/pricing/page.tsx`: public pricing.
- `app/billing/success/page.tsx`: post-checkout verification.
- `app/billing/cancel/page.tsx`: checkout cancel state.
- `app/integrations/meta/callback/page.tsx`: Meta OAuth callback handling.
- `app/settings/profile/page.tsx`: profile update and avatar upload.

### 6.3 Frontend components (feature groups)
- `components/conversations/*`: chat sidebar/window, sending/manual/AI reply mode.
- `components/automation/*`: flow cards, builder, modals.
- `components/commentAutomation/*`: comment trigger CRUD UI.
- `components/knowledgeBase/*`: KB create/list/delete/update.
- `components/aiTraining/*`: business info + faq + ai settings forms.
- `components/booking/*`: slots, appointments, booking drawer/tabs.
- `components/billing/*`: plan cards, payment history, usage summary.
- `components/analytics/*`: charts, funnel, sources, overview.
- `components/settings/*`: account/security/integrations/billing/notifications settings.
- `components/layout/*`: sidebar/topbar/dashboard chrome.
- `components/onboarding/*`: onboarding steps and trial CTA.
- `components/FeatureGate.tsx`: plan-based UI gate.

### 6.4 Frontend API/service layer
- `frontend/lib/apiClient.ts`: unified API client, response normalization, timeout, error handling.
- `frontend/lib/auth.ts`: auth endpoints wrapper.
- `frontend/lib/userApi.ts`: current user + profile + notifications + search APIs.
- `frontend/lib/dashboard.api.ts`: dashboard/leads APIs.
- `frontend/lib/billing.ts`: checkout start/confirm helpers.
- `frontend/lib/booking.api.ts`: slots + appointment create/reschedule/cancel.
- `frontend/lib/automation.service.ts`: automation/comment trigger APIs.
- `frontend/lib/analytics.ts`: analytics fetchers.
- `frontend/lib/autonomous.ts`: autonomous dashboard/run APIs.
- `frontend/lib/usage.service.ts`: usage overview API.
- `frontend/lib/featureGuard.ts`: frontend plan/feature mapping.
- `frontend/lib/socket.ts`: socket client.

## 7) Frontend -> Backend Endpoint Mapping (Major)
- Auth UI -> `/api/auth/*`
- Dashboard KPIs -> `/api/dashboard/stats`, `/api/dashboard/active-conversations`
- Leads UI -> `/api/dashboard/leads*`
- Conversations UI -> `/api/conversations`, `/api/conversations/:leadId/messages`
- Message send/preview -> `/api/conversations/:leadId/messages`, `/api/ai/test`
- Automation UI -> `/api/automation/flows`
- Comment automation UI -> `/api/comment-triggers/*`
- Training UI -> `/api/training/business`, `/api/training/faq`, `/api/training/settings`
- Knowledge base UI -> `/api/knowledge*`
- Booking UI -> `/api/booking/*`, `/api/availability/*`
- Billing UI -> `/api/billing`, `/api/billing/plans`, `/api/billing/*checkout*`
- Usage cards -> `/api/usage`
- Settings security -> `/api/security/*`, `/api/audit/*`
- Notifications UI -> `/api/notifications*`
- Integrations UI -> `/api/clients/*`, `/api/integrations/*`

## 8) Existing Detailed Backend File Map
For backend file-by-file details, this repo already contains a dedicated map:
- `backend/docs/backend-file-map.md`

That file lists route/controller/service utilities one-by-one with their role.

## 9) Recommended Reading Order (Fastest Understanding)
1. Backend runtime start:
   - `backend/src/server.ts`
   - `backend/src/app.ts`
   - `backend/src/runtime/lifecycle.ts`
2. Inbound flow:
   - `backend/src/routes/instagram.webhook.ts`
   - `backend/src/routes/whatsapp.webhook.ts`
   - `backend/src/services/receptionIntake.service.ts`
   - `backend/src/workers/receptionRuntime.worker.ts`
   - `backend/src/workers/ai.partition.worker.ts`
3. AI decisioning:
   - `backend/src/services/executionRouter.servce.ts`
   - `backend/src/services/aiReplyOrchestrator.service.ts`
   - `backend/src/services/revenueBrain/orchestrator.service.ts`
4. Frontend app shell + auth:
   - `frontend/app/layout.tsx`
   - `frontend/providers.tsx`
   - `frontend/context/AuthContext.tsx`
   - `frontend/app/(dashboard)/layout.tsx`
5. Main product flows:
   - `frontend/app/(dashboard)/dashboard/page.tsx`
   - `frontend/app/(dashboard)/conversations/page.tsx`
   - `frontend/components/conversations/ChatWindow.tsx`
   - `frontend/app/(dashboard)/billing/page.tsx`

