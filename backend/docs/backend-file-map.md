# Backend File Map

Static analysis date: `2026-04-19`

Scope:
- Includes project-authored backend files in `backend/`.
- Excludes `backend/dist/` because it is build output.
- Excludes `backend/node_modules/` because it is third-party code.

## Sabse Important: Is Backend Me Kya Use Ho Raha Hai

- Runtime: `Node.js` + `TypeScript`
- HTTP API: `Express 5`
- Database ORM: `Prisma`
- Database: `MongoDB` via Prisma datasource
- Queue/Workers: `BullMQ` + `Redis` (`ioredis`)
- Auth: `JWT`, refresh tokens, cookies, `Passport`, `passport-google-oauth20`
- AI layer: `openai` SDK, but reply generation code mostly `Groq` compatible base URL se chal raha hai
- Embeddings/RAG: `@xenova/transformers`, optional OpenAI embeddings fallback, `cosine-similarity`
- Payments: `Stripe`
- Messaging: `Twilio` (WhatsApp), Meta/Instagram/WhatsApp Graph API calls
- File upload/media: `multer` + `cloudinary`
- Emails: `Resend`, `nodemailer`, `pdfkit`
- Realtime: `socket.io`
- Scheduling: `node-cron`
- Security/ops: `helmet`, `cors`, `compression`, `express-rate-limit`, `Sentry`, `pino`

## High-Level Backend Flow

1. `src/server.ts` HTTP server banata hai.
2. `src/app.ts` Express app, middleware, webhooks, auth, routes mount karta hai.
3. Instagram/WhatsApp inbound messages webhooks se aate hain.
4. Webhook `queues/ai.queue.ts` me jobs enqueue karta hai.
5. `workers/ai.partition.worker.ts` queue consume karta hai.
6. Worker `services/executionRouter.servce.ts` aur `services/aiReplyOrchestrator.service.ts` ke through decide karta hai:
   booking, automation, ya sales-agent reply.
7. Reply DB me save hota hai, platform par send hota hai, sockets se frontend ko emit hota hai, aur analytics/followups track hote hain.

## Root Files

- `backend/package.json`: backend ka main manifest. Scripts (`dev`, `build`, `start`, `dev:worker`) aur saari dependencies yahin defined hain.
- `backend/package-lock.json`: dependency lock file. Install ko reproducible banata hai; npm use karta hai.
- `backend/tsconfig.json`: TypeScript compiler settings. `tsc` build ke time use hota hai.
- `backend/prisma.config.ts`: Prisma ko schema aur migrations path batata hai.
- `backend/.env`: real runtime secrets/config. App startup me `config/env.ts` indirectly read karta hai.
- `backend/.env.example`: required env variables ka template.
- `backend/.gitignore`: git ko kaunse backend artifacts ignore karne hain.
- `backend/docs/ai-sales-agent-system.md`: AI sales-agent architecture ka handwritten overview. Team documentation ke kaam aata hai.
- `backend/prisma/schema.prisma`: poori DB schema. User, Business, Lead, Message, Subscription, Booking, Knowledge, Analytics, Notification, Automation sab yahin defined hain.

## `src` Core Entry Files

- `src/server.ts`: HTTP server banata hai, socket server initialize karta hai, graceful shutdown handle karta hai. Backend ka actual process entry point hai.
- `src/app.ts`: Express app setup. CORS, Helmet, request logging, webhook raw-body parsing, route mounting, queue enqueue endpoint, error handler, cron startup sab yahin hai.

## `src/config`

- `src/config/env.ts`: saare env vars validate/normalize karta hai. Almost poora backend isi centralized config ko use karta hai.
- `src/config/prisma.ts`: shared Prisma client instance export karta hai. Repositories, controllers, services sab yahin se DB access lete hain.
- `src/config/redis.ts`: Redis connection management. Queues, rate-limits, locks, cache, dedup sab isi par depend karte hain.
- `src/config/passport.ts`: Google OAuth strategy aur Passport serialization helpers configure karta hai. `app.ts` startup par use karta hai.
- `src/config/cloudinary.ts`: Cloudinary client configure karta hai. `routes/user.routes.ts` avatar upload ke time use karti hai.
- `src/config/plan.config.ts`: plan keys, limits, features, upgrade suggestions define karta hai. Billing, feature gates, usage aur sales policy me use hota hai.
- `src/config/stripe.price.map.ts`: Stripe price ID ko internal plan type me map karta hai. Current import graph me unused hai, lekin billing normalization ke liye useful utility hai.
- `src/config/monitoring.config.ts`: slow request threshold config. Current import graph me unused hai.

## `src/constants`

- `src/constants/aiFunnelStages.ts`: AI funnel stage enum (`NEW`, `QUALIFY`, `INTEREST`, `OFFER`, `CLOSE`). Current import graph me unused.

## `src/types`

- `src/types/request.ts`: typed `AuthenticatedRequest` helper. AI, training, knowledge controllers me typed request bodies ke liye use hota hai.
- `src/types/billing.types.ts`: billing plans aur feature enum/type definitions. Current import graph me unused, lekin billing domain types ke liye ready file hai.
- `src/types/dashboard.types.ts`: dashboard stats interface. Current import graph me unused.
- `src/types/express/index.d.ts`: Express `Request.user` type augmentation. Auth middleware ke baad `req.user` ko type-safe banata hai.

## `src/utils`

- `src/utils/AppError.ts`: custom app error class aur helpers (`badRequest`, `forbidden`, etc.). `app.ts`, auth controller, auth middleware isse structured error responses banate hain.
- `src/utils/authCookies.ts`: auth cookies set/clear/options helpers. Auth, Google OAuth, logout, session cleanup me use hota hai.
- `src/utils/generateToken.ts`: access/refresh JWT create aur verify karta hai. Auth controller, Google auth, token refresh, auth middleware me use hota hai.
- `src/utils/encrypt.ts`: symmetric encrypt/decrypt helper. Meta/Instagram tokens aur other secrets ko safely store/read karne me use hota hai.
- `src/utils/googleOAuthState.ts`: Google OAuth state token create/verify aur redirect origin resolve karta hai. Google auth route/controller me use hota hai.
- `src/utils/logger.ts`: shared `pino` logger instance. Queues, workers, sales-agent services aur monitoring code me use hota hai.
- `src/utils/retry.utils.ts`: async retry helper. Main AI worker transient failures me use karta hai.
- `src/utils/monthlyUsage.helper.ts`: current month/year aur month range helpers. Usage tracking service me use hota hai.
- `src/utils/analytics.utils.ts`: analytics date range helper. `services/analytics.service.ts` me use hota hai.
- `src/utils/booking-ai.utils.ts`: booking text parsing, slot matching, slot formatting helpers. Booking engine/handler me use hota hai.
- `src/utils/bookingErrorHandler.utils.ts`: booking-specific error message formatting helper. Current import graph me unused.
- `src/utils/geo.ts`: IP se country helper. Current import graph me unused.
- `src/utils/timezoneHandler.utils.ts`: timezone detect/convert/format helper set. Current import graph me unused.

## `src/middleware`

- `src/middleware/auth.middleware.ts`: JWT/cookie based protection middleware. Almost sab protected API routes isi se secure hote hain.
- `src/middleware/subscription.middleware.ts`: billing context load karta hai aur request par attach karta hai. AI, billing, analytics, booking routes me plan-aware behavior ke liye use hota hai.
- `src/middleware/rateLimit.middleware.ts`: global/auth/AI HTTP rate limiters. `app.ts`, auth routes aur billing routes me use hota hai.
- `src/middleware/loginLimiter.ts`: login-specific limiter. `routes/auth.routes.ts` me brute-force protection ke liye use hota hai.
- `src/middleware/planFeature.middleware.ts`: feature gate middleware. Comment triggers, dashboard, Instagram routes par plan restrictions enforce karta hai.
- `src/middleware/monitoring.middleware.ts`: request monitoring middleware. `app.ts` me globally mounted hai.
- `src/middleware/serviceRateLimiter.ts`: service-level rate increment helper. Current import graph me unused.
- `src/middleware/upload.ts`: `multer` upload middleware. User avatar upload route me use hota hai.

## `src/analytics`

- `src/analytics/analytics.repository.ts`: basic analytics DB aggregations. `services/analytics.service.ts` isko call karta hai.
- `src/analytics/analyticsDashboard.repository.ts`: deep dashboard data fetchers for leads, messages, conversions, appointments. `services/analyticsDashboard.service.ts` ka data source hai.

## `src/models`

- `src/models/availability.model.ts`: booking availability CRUD directly `bookingSlot` collection par chalata hai. `controllers/availabilty.controller.ts` isko use karta hai.

## `src/handlers`

- `src/handlers/booking-ai.handler.ts`: older booking-intent handler wrapper. Current import graph me unused, lekin `aiBookingEngine.service.ts` ko single-source booking flow ke wrapper ke tarah likha gaya hai.

## `src/redis`

- `src/redis/rateLimiter.redis.ts`: Redis-based custom rate limit keys/increment helpers. AI rate limit aur comment automation rate control me use hota hai.

## `src/sockets`

- `src/sockets/socket.server.ts`: Socket.IO initialize aur shared `io` getter deta hai. Server startup, message routes, notification routes, webhooks, workers sab realtime emit ke liye use karte hain.

## `src/monitoring`

- `src/monitoring/systemHealth.monitor.ts`: queue aur Redis health combine karke system status banata hai. Current import graph me unused.

## `src/routes`

- `src/routes/auth.routes.ts`: register/login/verify/reset/logout endpoints. `app.ts` isse `/api/auth` par mount karta hai.
- `src/routes/googleAuth.routes.ts`: Google login + callback flow. `app.ts` me `/api/auth` par mount hai.
- `src/routes/client.routes.ts`: client/integration CRUD aur Meta OAuth start/connect. `app.ts` me `/api/clients`.
- `src/routes/ai.routes.ts`: sales-agent blueprint, preview, test endpoints. `app.ts` me `/api/ai`.
- `src/routes/ai-booking.routes.ts`: AI booking test routes (`/intent`, `/confirm`, `/health`). Current `app.ts` me mounted nahi hai.
- `src/routes/analytics.routes.ts`: overview/charts/funnel/revenue/conversion endpoints. `app.ts` me `/api/analytics`.
- `src/routes/automation.routes.ts`: automation flow create/list/update endpoints. `app.ts` me `/api/automation`.
- `src/routes/availability.routes.ts`: booking availability CRUD and toggle. `app.ts` me `/api/availability`.
- `src/routes/billing.routes.ts`: plans, checkout, portal, cancel, current subscription. `app.ts` me `/api/billing`.
- `src/routes/booking.routes.ts`: available slots, appointment create/reschedule/cancel/list. `app.ts` me `/api/booking`.
- `src/routes/commentTrigger.routes.ts`: Instagram comment trigger CRUD/toggle. `app.ts` me `/api/comment-triggers`.
- `src/routes/conversation.routes.ts`: conversation list, per-lead messages, send message, mark read. `app.ts` me `/api/conversations`.
- `src/routes/dashboard.routes.ts`: dashboard stats, leads, active conversations, lead stage change. `app.ts` me `/api/dashboard`.
- `src/routes/instagram.routes.ts`: Instagram media fetch endpoint. `app.ts` me `/api/instagram`.
- `src/routes/instagram.webhook.ts`: Instagram webhook verification + inbound DM/comment processing. `app.ts` me `/api/webhook/instagram` aur `/webhook/instagram`.
- `src/routes/integration.routes.ts`: connected integrations listing. `app.ts` me `/api/integrations`.
- `src/routes/knowledge.routes.ts`: knowledge base CRUD. `app.ts` me `/api/knowledge`.
- `src/routes/lead.routes.ts`: human takeover toggle/status per lead. `app.ts` me `/api/leads`.
- `src/routes/message.routes.ts`: message fetch/send/delete/read endpoints. `app.ts` me `/api/messages`.
- `src/routes/notification.ts`: notifications list/settings/read operations. `app.ts` me `/api/notifications`.
- `src/routes/oauth.routes.ts`: Meta OAuth callback bridge. `app.ts` me `/api/oauth`.
- `src/routes/search.routes.ts`: unified search across navigation/leads/messages. `app.ts` me `/api/search`.
- `src/routes/security.routes.ts`: active sessions list aur logout-all. `app.ts` me `/api/security`.
- `src/routes/stripeWebhook.routes.ts`: Stripe webhook POST endpoint wrapper. `app.ts` me `/api/webhooks/stripe`.
- `src/routes/training.routes.ts`: business info, FAQs, AI settings save/get. `app.ts` me `/api/training`.
- `src/routes/user.routes.ts`: current user, profile/business update, avatar upload, password change, API key, account delete. `app.ts` me `/api/user`.
- `src/routes/whatsapp.webhook.ts`: WhatsApp webhook verification + inbound message processing. `app.ts` me `/api/webhook/whatsapp`.
- `src/routes/health.routes.ts`: Redis/queue/system health endpoint. Current `app.ts` me mounted nahi hai.
- `src/routes/inbox.routes.ts`: BullMQ inbox worker bootstrap-like file. Route folder me hai but actually worker-style code hai; current `app.ts` me mounted nahi hai.

## `src/controllers`

- `src/controllers/auth.controller.ts`: register/login/logout, email verification, password reset, `getMe`. `auth.routes.ts` isko use karti hai.
- `src/controllers/googleAuth.controller.ts`: Google OAuth entry/callback token issuing aur user linking. `googleAuth.routes.ts` ka controller hai.
- `src/controllers/client.controller.ts`: client create/update/delete, Meta OAuth connect, AI training update. `client.routes.ts` me use hota hai.
- `src/controllers/ai.controller.ts`: sales-agent blueprint aur preview/test endpoints. `ai.routes.ts` isko use karti hai.
- `src/controllers/ai-booking.controller.ts`: AI booking intent/confirm controllers. `ai-booking.routes.ts` me use hota hai.
- `src/controllers/analytics.controller.ts`: overview, charts, funnel, revenue, deep dashboard, conversion recording. `analytics.routes.ts` me use hota hai.
- `src/controllers/automation.controller.ts`: automation flows create/list/update. `automation.routes.ts` me use hota hai.
- `src/controllers/availabilty.controller.ts`: availability CRUD validation + response layer. `availability.routes.ts` me use hota hai.
- `src/controllers/billing.controller.ts`: billing plans/current status/checkout/portal/cancel flows. `billing.routes.ts` isko call karti hai.
- `src/controllers/booking.controller.ts`: slot fetch, appointment create/reschedule/cancel. `booking.routes.ts` ka controller hai.
- `src/controllers/commentTrigger.controller.ts`: comment trigger CRUD/toggle with plan checks. `commentTrigger.routes.ts` me use hota hai.
- `src/controllers/conversation.controller.ts`: conversations aur messages retrieve karta hai, manual message send karta hai. `conversation.routes.ts` me use hota hai.
- `src/controllers/dashboard.controller.ts`: dashboard stats, lead lists, stage updates. `dashboard.routes.ts` se called.
- `src/controllers/instagram.controller.ts`: Instagram media fetch endpoint. `instagram.routes.ts` me use hota hai.
- `src/controllers/integration.controller.ts`: business ke linked integrations return karta hai. `integration.routes.ts` me use hota hai.
- `src/controllers/knowledge.controller.ts`: knowledge item create/read/update/delete aur embeddings handle karta hai. `knowledge.routes.ts` me use hota hai.
- `src/controllers/lead.controller.ts`: human control on/off aur state fetch. `lead.routes.ts` me use hota hai.
- `src/controllers/message.controller.ts`: direct message fetch/send/delete/read aur followup cancel side-effects. `message.routes.ts` me use hota hai.
- `src/controllers/security.controller.ts`: refresh token sessions list aur logout-all. `security.routes.ts` me use hota hai.
- `src/controllers/stripeWebhook.controller.ts`: Stripe event verify/process, billing sync, invoice/tax/email/conversion side-effects. `stripeWebhook.routes.ts` isko use karti hai.
- `src/controllers/token.controller.ts`: refresh token se new access token issue karta hai. Current import graph me route se connected nahi hai.
- `src/controllers/training.controller.ts`: business info, FAQ, AI settings store/get; embeddings bhi generate karta hai. `training.routes.ts` me use hota hai.

## `src/queues`

- `src/queues/ai.queue.ts`: main AI queue setup, queue partitioning, enqueue helpers, queue close helpers. Webhooks, app enqueue endpoint, health checks, worker sab use karte hain.
- `src/queues/authEmail.queue.ts`: verification/password-reset email queue. Auth controller enqueue karta hai, auth email worker consume karta hai.
- `src/queues/automation.queue.ts`: automation jobs queue. Instagram webhook automation trigger par use karta hai.
- `src/queues/bookingReminder.queue.ts`: appointment reminder scheduling queue. Booking services aur reminder worker use karte hain.
- `src/queues/followup.queue.ts`: sales followup scheduling/cancel queue. Webhooks, analytics controller, message controller, worker sab use karte hain.
- `src/queues/funnel.queue.ts`: funnel queue instance. Health route isko inspect karta hai.
- `src/queues/inbox.queue.ts`: inbox worker bootstrap-like queue file with Sentry/logger setup. Current import graph me unused.
- `src/queues/learning.queue.ts`: learning queue aur enqueue helper. Current import graph me unused.
- `src/queues/example.queue.ts`: example/test queue + worker. Current import graph me unused.

## `src/workers`

- `src/workers/ai.worker.ts`: tiny bootstrap file jo main AI partition worker import karta hai. `npm run start:worker` style entry ke liye.
- `src/workers/ai.partition.worker.ts`: sabse important runtime worker. AI queue jobs consume karta hai, locks/rate-limit/retries handle karta hai, reply save/send/emit/track/followup schedule karta hai.
- `src/workers/authEmail.worker.ts`: auth email queue consume karta hai aur email sending service call karta hai.
- `src/workers/automation.worker.ts`: automation queue consume karke comment automation service chalata hai.
- `src/workers/bookingReminder.worker.ts`: booked appointments ke reminder messages send karta hai.
- `src/workers/bookingMonitor.worker.ts`: bookings monitor karke AI followups/WhatsApp reminders handle karta hai.
- `src/workers/followup.worker.ts`: scheduled sales followups send karta hai, conversion tracking aur socket updates ke saath.
- `src/workers/funnel.worker.ts`: funnel queue consumer. Current implementation light hai; mostly queue plumbing.
- `src/workers/learning.worker.ts`: learning queue consumer bootstrap. Current import graph me worker file itself directly mounted nahi hai.
- `src/workers/cluster.worker.ts`: worker clustering bootstrap. `workerManager.ts` ka count use karta hai.
- `src/workers/example.worker.ts`: example/test worker. Current import graph me unused.
- `src/workers/workerManager.ts`: CPU based worker count helper. Cluster worker use karta hai.

## `src/cron`

- `src/cron/trial.cron.ts`: expired trials ko process karta hai. `app.ts` `ENABLE_CRON=true` par start karta hai.
- `src/cron/resetUsage.cron.ts`: monthly usage reset cron. `app.ts` se start hota hai.
- `src/cron/metaTokenRefresh.cron.ts`: Meta access tokens refresh karta hai. `app.ts` se start hota hai.
- `src/cron/messageCleanup.cron.ts`: old message cleanup + summary generation. Current import graph me startup se connected nahi hai.
- `src/cron/cron.cleanup.ts`: cleanup logic implementation. `cron.runner.ts` use karta hai.
- `src/cron/cron.runner.ts`: generic cron runner wrapper. Current startup path me unused.

## `src/services` Core/Platform

- `src/services/actionExecutor.service.ts`: automation steps ke actions execute karta hai. `automationEngine.service.ts` isko use karta hai.
- `src/services/ai.service.ts`: generic AI reply wrapper. `commentAutomation.service.ts` isko call karta hai.
- `src/services/aiAutoLearning.service.ts`: auto-learning enqueue wrapper. Current import graph me unused.
- `src/services/aiBookingEngine.service.ts`: booking intent samajhkar slot suggest/confirm karta hai, appointment create karta hai, conversation state aur reminders manage karta hai. Booking controllers aur priority router me use hota hai.
- `src/services/aiConversionBooster.service.ts`: reply me urgency/FOMO/CTA add karne wali booster logic. Current import graph me unused.
- `src/services/aiFollowup.service.ts`: AI-generated WhatsApp followup send karne ka helper. Booking monitor worker me use hota hai.
- `src/services/aiFunnel.service.ts`: funnel-style AI reply wrapper over `aiRuntime`. Current import graph me unused.
- `src/services/aiIntentEngine.service.ts`: intent-specific AI reply wrapper. Current import graph me unused.
- `src/services/aiMemoryEngine.service.ts`: lead memory build/update karta hai, OpenAI/Groq summarization use karta hai. Sales intelligence layer isko use karti hai.
- `src/services/aiPipelineState.service.ts`: Redis-based lead processing lock aur reply delivery state tracking. AI worker aur followup worker me use hota hai.
- `src/services/aiRateLimiter.service.ts`: AI job rate limit check. Main AI worker me use hota hai.
- `src/services/aiReplyOrchestrator.service.ts`: booking, automation, human takeover aur sales-agent ke beech final reply source choose karta hai. `executionRouter.servce.ts` ka core brain hai.
- `src/services/aiRouter.service.ts`: AI router layer जो sales-agent reply aur conversation state ko wrap karti hai. Orchestrator isko use karta hai.
- `src/services/aiRuntime.service.ts`: unified AI reply/intention/fallback interface. Higher-level AI wrapper services isko use karti hain.
- `src/services/analytics.service.ts`: simple overview/charts/funnel/source analytics compose karta hai. Analytics controller se called.
- `src/services/analyticsDashboard.service.ts`: deep dashboard metrics, A/B data, optimizer insights, revenue calculations banata hai. Analytics controller ka heavy analytics engine.
- `src/services/authEmail.service.ts`: `Resend` based verification/password reset email logic. Auth email queue/worker use karte hain.
- `src/services/automationEngine.service.ts`: event-based automation flow run karta hai. Orchestrator automation stage me isko call karta hai.
- `src/services/billingGeo.service.ts`: request country detect karke billing currency decide karta hai.
- `src/services/billingSync.service.ts`: Stripe checkout/subscription state ko local DB se sync karta hai. Billing controller, Stripe webhook, checkout service use karte hain.
- `src/services/booking.service.ts`: slots fetch, appointment create/reschedule/cancel, reminder schedule, owner notify, conversion record. Booking controller aur booking AI dono use karte hain.
- `src/services/bookingPriorityRouter.service.ts`: booking-related intent ko high priority se route karta hai. Reply orchestrator ka booking gate hai.
- `src/services/checkout.service.ts`: Stripe checkout session create karta hai, coupon/tax/currency/billing sync integrate karta hai. Billing controller se called.
- `src/services/client.service.ts`: `phoneNumberId` se client get-or-create helper. Current import graph me unused.
- `src/services/clientScope.service.ts`: shared vs client-specific training scope decide karta hai. Knowledge, training, RAG, sales-intelligence me use hota hai.
- `src/services/clientUpsert.service.ts`: client unique-key based upsert logic. Client controller aur scope service use karte hain.
- `src/services/commentAutomation.service.ts`: Instagram comment automation flow, DM trigger aur AI reply build karta hai. Automation worker isko चलाता hai.
- `src/services/conversationCache.service.ts`: Redis conversation cache helper. Current import graph me unused.
- `src/services/conversationLearning.service.ts`: conversations se learnable data persist karta hai. Knowledge ingestion isko use karti hai.
- `src/services/conversationState.service.ts`: per-lead conversation state CRUD. Booking, sales progression, orchestrator sab isi par depend karte hain.
- `src/services/conversationSummary.service.ts`: conversation summary generate/store karta hai. Message cleanup cron aur sales intelligence me use hota hai.
- `src/services/coupon.service.ts`: Stripe coupon validation/apply helper. Stripe/checkout services me use hota hai.
- `src/services/dashboard.service.ts`: dashboard-specific business stats aur lead views deta hai. Dashboard controller isko use karta hai.
- `src/services/email.service.ts`: `nodemailer` + `pdfkit` based emails, including subscription/invoice emails. Stripe webhook controller isko use karta hai.
- `src/services/embedding.service.ts`: local `Xenova/all-MiniLM-L6-v2` embeddings banata hai; OpenAI fallback support bhi hai. Knowledge/training/RAG files use karti hain.
- `src/services/eventBus.service.ts`: in-process event bus. Automation engine me lead/message/automation events emit karne ke liye.
- `src/services/executionRouter.servce.ts`: worker se aane wale message ko orchestrator tak le jaata hai. `ai.partition.worker.ts` isko use karta hai.
- `src/services/fetchNext30DaysSlots.service.ts`: next 30 days ke slots aggregate karta hai. Booking priority router me use hota hai.
- `src/services/funnelAnalytics.service.ts`: automation/funnel step views and conversions track karta hai. Automation engine use karta hai.
- `src/services/humanTakeoverManager.service.ts`: human-agent override on/off aur timeout logic. Orchestrator aur AI runtime me use hota hai.
- `src/services/instagram.service.ts`: Instagram media fetch करता hai. Instagram controller use karta hai.
- `src/services/instagramProfile.service.ts`: Instagram sender/profile username fetch helper. Conversation controller aur Instagram webhook me use hota hai.
- `src/services/invoice.service.ts`: invoice number generation aur invoice retrieval helper. Billing and Stripe webhook flows me use hota hai.
- `src/services/knowledgeIngestion.service.ts`: knowledge embeddings + learning persistence pipeline. Learning queue service use karti hai.
- `src/services/knowledgeSearch.service.ts`: embedding similarity se knowledge search karta hai. RAG aur sales intelligence me use hota hai.
- `src/services/leadBehaviourEngine.service.ts`: lead `aiStage`/score se tone-goal behavior map banata hai. Current import graph me unused.
- `src/services/leadIntelligence.service.ts`: incoming message se lead score, temperature, stage update karta hai. Current import graph me unused.
- `src/services/learningFilter.service.ts`: kis input par learning trigger honi chahiye, yeh decide karta hai. Learning queue service use karti hai.
- `src/services/learningQueue.service.ts`: learning jobs enqueue/route karta hai. `aiAutoLearning.service.ts` isko use karta hai.
- `src/services/message.service.ts`: message save/fetch/read low-level helper. Current import graph me unused.
- `src/services/monitoringLogger.service.ts`: centralized logger + Sentry helpers. Current import graph me unused.
- `src/services/notification.service.ts`: notification create karke socket emit karta hai. Instagram webhook isko use karta hai.
- `src/services/ownerNotification.service.ts`: owner ko WhatsApp booking notifications bhejta hai. Booking services me use hota hai.
- `src/services/platformRateLimiter.service.ts`: per-platform Redis rate limiter. Current import graph me unused.
- `src/services/queueDedup.service.ts`: job idempotency/dedup via Redis. Current import graph me unused.
- `src/services/queueHealth.service.ts`: AI queue health summary deta hai. `systemHealth.monitor.ts` use karta hai.
- `src/services/rag.service.ts`: knowledge-grounded reply generation with cached retrieval and stage-aware tone. Current import graph me unused.
- `src/services/redisHealth.service.ts`: Redis ping health helper. `systemHealth.monitor.ts` use karta hai.
- `src/services/redisState.service.ts`: shared Redis key builders + write helpers for decisions, progression, idempotency. Multiple queue/sales/webhook services use karte hain.
- `src/services/sendMessage.service.ts`: axios-based Instagram/WhatsApp outbound send helpers. Current import graph me unused.
- `src/services/slotLock.service.ts`: booking slot locks in Redis. Booking engine aur slot selection handler me use hota hai.
- `src/services/slotSectionHandler.service.ts`: slot selection state transitions handle karta hai. Booking priority router me use hota hai.
- `src/services/smartFallback.service.ts`: generic fallback reply wrapper over AI runtime. Current import graph me unused.
- `src/services/stripe.service.ts`: central Stripe client and some checkout helpers. Billing, webhook, user deletion, coupon/invoice flows me use hota hai.
- `src/services/tax.service.ts`: billing tax config/details helpers. Stripe and checkout flows me use hota hai.
- `src/services/trial.service.ts`: trial start/expire logic. Current import graph me unused directly, though cron equivalent behavior present hai.
- `src/services/triggerMatcher.service.ts`: automation trigger matching logic. Automation engine use karta hai.
- `src/services/usage.service.ts`: plan-based monthly usage increment/check. Current import graph me unused.
- `src/services/webhookDedup.service.ts`: webhook events ko deduplicate karta hai. Instagram aur WhatsApp webhooks me use hota hai.
- `src/services/webhookHealth.service.ts`: webhook failure counts Redis me log/read karta hai. Current import graph me unused.
- `src/services/whatsapp.service.ts`: Twilio-based WhatsApp send/template helpers. Booking/followup services and workers isko use karte hain.

## `src/services/salesAgent`

- `src/services/salesAgent/types.ts`: sales-agent domain ke saare core types. Saara sales-agent stack isko share karta hai.
- `src/services/salesAgent/policy.service.ts`: plan-aware capabilities aur allowed CTAs decide karta hai. Blueprint, intelligence, followup me use hota hai.
- `src/services/salesAgent/blueprint.service.ts`: sales-agent architecture blueprint build karta hai. `ai.controller.ts` isko expose karta hai.
- `src/services/salesAgent/intelligence.service.ts`: lead context build karta hai using memory, knowledge, training, summaries, lead state, qualification gaps. `reply.service.ts` aur AI runtime ke liye important context builder.
- `src/services/salesAgent/decisionEngine.service.ts`: best sales action choose karta hai using optimization history, progression, patterns, A/B stats. Reply aur followup dono ke liye central decision brain.
- `src/services/salesAgent/progression.service.ts`: conversation progression/funnel state build aur persist karta hai. Reply generation aur reply cache me use hota hai.
- `src/services/salesAgent/prompt.service.ts`: LLM prompt/messages build karta hai, parse aur fallback helpers bhi deta hai. `reply.service.ts` isko use karta hai.
- `src/services/salesAgent/replyGuardrails.service.ts`: guardrails, safe fallbacks, recovery replies. Prompt/reply services me use hota hai.
- `src/services/salesAgent/replyCache.service.ts`: reply-state Redis cache. Reply service aur AI worker use karte hain.
- `src/services/salesAgent/reply.service.ts`: main sales-agent LLM reply generator. Decision, intelligence, prompt, guardrails, cache, optimizer sabko combine karta hai.
- `src/services/salesAgent/followup.service.ts`: sales followup trigger/schedule/message generation. Followup queue aur worker use karte hain.
- `src/services/salesAgent/abTesting.service.ts`: message variants select/impression/outcome tracking aur auto-promotion. Analytics dashboard, decision engine, optimizer use karte hain.
- `src/services/salesAgent/conversionTracker.service.ts`: AI replies, conversions, lead outcomes, revenue intelligence track karta hai. Webhooks, workers, analytics, Stripe webhook sab me use hota hai.
- `src/services/salesAgent/leadState.service.ts`: lead-state directives and history handling. Conversion tracker, decision engine, intelligence me use hota hai.
- `src/services/salesAgent/optimizer.service.ts`: reply/followup/conversion events se optimization insights nikalta hai. Reply, booking, analytics dashboard me use hota hai.

## Current “Used by None” / Not Mounted Observations

Static import graph ke basis par ye files currently direct runtime path me connected nahi dikhi:

- `src/config/monitoring.config.ts`
- `src/config/stripe.price.map.ts`
- `src/constants/aiFunnelStages.ts`
- `src/controllers/token.controller.ts`
- `src/cron/cron.runner.ts`
- `src/cron/messageCleanup.cron.ts`
- `src/handlers/booking-ai.handler.ts`
- `src/middleware/serviceRateLimiter.ts`
- `src/monitoring/systemHealth.monitor.ts`
- `src/queues/example.queue.ts`
- `src/queues/inbox.queue.ts`
- `src/queues/learning.queue.ts`
- `src/routes/ai-booking.routes.ts`
- `src/routes/health.routes.ts`
- `src/routes/inbox.routes.ts`
- `src/services/aiAutoLearning.service.ts`
- `src/services/aiConversionBooster.service.ts`
- `src/services/aiFunnel.service.ts`
- `src/services/aiIntentEngine.service.ts`
- `src/services/client.service.ts`
- `src/services/conversationCache.service.ts`
- `src/services/leadBehaviourEngine.service.ts`
- `src/services/leadIntelligence.service.ts`
- `src/services/message.service.ts`
- `src/services/monitoringLogger.service.ts`
- `src/services/platformRateLimiter.service.ts`
- `src/services/queueDedup.service.ts`
- `src/services/rag.service.ts`
- `src/services/sendMessage.service.ts`
- `src/services/smartFallback.service.ts`
- `src/services/trial.service.ts`
- `src/services/usage.service.ts`
- `src/services/webhookHealth.service.ts`
- `src/types/billing.types.ts`
- `src/types/dashboard.types.ts`
- `src/utils/bookingErrorHandler.utils.ts`
- `src/utils/geo.ts`
- `src/utils/timezoneHandler.utils.ts`
- `src/workers/example.worker.ts`

Note:
- “Unused” ka matlab sirf current static import graph me direct importer nahi mila.
- Ho sakta hai kuch files manual entrypoints, future features, scripts, ya dynamic loading ke liye rakhi gayi hon.

## Short Folder-Level Understanding

- `routes/`: HTTP endpoint definitions
- `controllers/`: request/response layer
- `services/`: business logic
- `queues/` + `workers/`: async processing
- `salesAgent/`: AI closer / conversion engine
- `middleware/`: auth, plan gate, rate limit, monitoring
- `config/`: Prisma, Redis, env, OAuth, Cloudinary setup
- `utils/`: helpers
- `prisma/schema.prisma`: data model backbone

