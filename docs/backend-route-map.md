# Backend Route Map

Generated: 2026-05-06 19:06:02 +05:30

This file lists endpoint-style declarations found in `backend/src/routes/*`.

## ai.routes.ts
- No direct router verb declarations detected by pattern scan.

## ai-booking.routes.ts
- router.post("/intent", protect, handleAIBooking);
- router.post("/confirm", protect, confirmAIBookingController);
- router.get("/health", (req, res) => {

## analytics.routes.ts
- router.get("/dashboard", getDeepAnalyticsDashboard);
- router.get("/revenue", getRevenueAnalytics);
- router.get("/overview", getAnalyticsOverview);
- router.get("/charts", getAnalyticsCharts);
- router.get("/funnel", getConversionFunnel);
- router.get("/sources", getTopSources);

## audit.routes.ts
- No direct router verb declarations detected by pattern scan.

## auth.routes.ts
- router.post("/register", authLimiter, register);
- router.post("/login", loginLimiter, login);
- router.get("/me", protect, getMe);
- router.get("/verify-email", verifyEmail);
- router.post("/resend-verification", authLimiter, resendVerificationEmail);
- router.post("/logout", protect, logout);
- router.post("/forgot-password", authLimiter, forgotPassword);
- router.post("/reset-password", authLimiter, resetPassword);

## automation.routes.ts
- router.get("/flows", getFlows);
- router.post("/flows", auditRequest("automation.flow_created"), createAutomationFlow);

## autonomous.routes.ts
- router.get("/dashboard", getAutonomousDashboardController);
- router.get("/growth/projection", getGrowthOSProjectionController);
- router.get("/growth/self-audit", runGrowthSelfAuditController);

## availability.routes.ts
- router.post("/", protect, subscriptionGuard, createAvailabilityController);
- router.get("/health", (_req, res) => {
- router.get("/:businessId", getAvailabilityController);
- router.put("/:id", protect, subscriptionGuard, updateAvailabilityController);
- router.delete("/:id", protect, subscriptionGuard, deleteAvailabilityController);
- router.patch("/:id/toggle", protect, subscriptionGuard, updateAvailabilityController);

## billing.routes.ts
- router.get("/plans", BillingController.getPlans);

## booking.routes.ts
- router.get("/slots/:businessId", getAvailableSlots);
- router.post("/appointment", createAppointment);
- router.put("/appointment/:appointmentId/reschedule", rescheduleAppointmentController);
- router.delete("/appointment/:appointmentId", cancelAppointment);
- router.get("/list", listAppointments);
- router.post("/canonical/request", requestAppointmentController);
- router.post("/canonical/:appointmentKey/hold", holdAppointmentSlotController);
- router.post("/canonical/:appointmentKey/confirm", confirmAppointmentSlotController);
- router.post("/canonical/:appointmentKey/reschedule", rescheduleCanonicalAppointmentController);
- router.post("/canonical/:appointmentKey/cancel", cancelCanonicalAppointmentController);
- router.post("/canonical/:appointmentKey/check-in", checkInAppointmentController);
- router.post("/canonical/:appointmentKey/running-late", runningLateController);
- router.post("/canonical/waitlist", addWaitlistRequestController);
- router.get("/canonical/ops-projection", getAppointmentOpsProjectionController);
- router.post("/canonical/:appointmentKey/outcome", recordAppointmentOutcomeController);
- router.post("/canonical/:appointmentKey/artifacts", upsertMeetingArtifactsController);
- router.post("/canonical/calendar/replay", replayCalendarSyncWebhookController);

## calendar.webhook.ts
- router.get("/google", (_req: Request, res: Response) => {
- router.post("/google", async (req: Request, res: Response) => {
- router.get("/outlook", (req: Request, res: Response) => {
- router.post("/outlook", async (req: Request, res: Response) => {

## client.routes.ts
- router.post("/", protect, createClient);
- router.get("/", protect, getClients);
- router.get("/oauth/meta", protect, startMetaOAuth);
- router.post("/oauth/meta", protect, metaOAuthConnect);
- router.get("/:id", protect, getSingleClient);
- router.put("/:id", protect, updateClient);
- router.delete("/:id", protect, deleteClient);
- router.put("/ai-training/:id", protect, updateAITraining);

## commentTrigger.routes.ts
- No direct router verb declarations detected by pattern scan.

## commerce.routes.ts
- router.post("/proposal", requirePermission("billing:manage"), CommerceController.createProposal);
- router.post("/proposal/:proposalKey/send", requirePermission("billing:manage"), CommerceController.sendProposal);
- router.post("/proposal/:proposalKey/accept", requirePermission("billing:manage"), CommerceController.acceptProposal);
- router.post("/discount/:approvalKey/decision", requirePermission("billing:manage"), CommerceController.decideDiscount);
- router.post("/contract/from-proposal", requirePermission("billing:manage"), CommerceController.generateContract);
- router.post("/contract/:contractKey/signature", requirePermission("billing:manage"), CommerceController.requestSignature);
- router.post("/signature/:signatureKey/signed", requirePermission("billing:manage"), CommerceController.markSigned);
- router.post("/checkout", requirePermission("billing:manage"), CommerceController.createCheckout);
- router.post("/invoice", requirePermission("billing:manage"), CommerceController.issueInvoice);
- router.post("/subscription", requirePermission("billing:manage"), CommerceController.createSubscription);
- router.post("/subscription/:subscriptionKey/action", requirePermission("billing:manage"), CommerceController.subscriptionAction);
- router.post("/dunning/run", requirePermission("billing:manage"), CommerceController.runDunning);
- router.post("/refund", requirePermission("billing:manage"), CommerceController.requestRefund);
- router.post("/checkout/recover", requirePermission("billing:manage"), CommerceController.recoverCheckout);
- router.post("/ops/manual-retry", requirePermission("billing:manage"), CommerceController.manualRetryPayment);
- router.post("/ops/manual-credit", requirePermission("billing:manage"), CommerceController.manualCredit);
- router.post("/ops/subscription-override", requirePermission("billing:manage"), CommerceController.manualSubscriptionOverride);
- router.post("/ops/replay-pending-webhooks", requirePermission("billing:manage"), CommerceController.replayPendingWebhooks);
- router.post("/ops/replay-pending-entitlements", requirePermission("billing:manage"), CommerceController.replayPendingEntitlements);
- router.post("/reconcile-webhook", requirePermission("billing:manage"), CommerceController.reconcileWebhook);
- router.get("/projection", requirePermission("billing:view"), CommerceController.getProjection);
- router.post("/chargeback", requirePermission("billing:manage"), CommerceController.openChargeback);
- router.post("/provider-credential", requirePermission("billing:manage"), CommerceController.upsertProviderCredential);
- router.post("/override", requirePermission("billing:manage"), CommerceController.createManualOverride);

## commerceWebhook.routes.ts
- router.post("/:provider", commerceWebhook);

## conversation.routes.ts
- router.get("/", protect, subscriptionGuard, getConversations);
- router.get("/:leadId/messages", protect, subscriptionGuard, getMessagesByLead);
- router.post("/:leadId/messages", protect, subscriptionGuard, sendMessage);
- router.post("/:leadId/read", protect, subscriptionGuard, markAsRead);

## dashboard.routes.ts
- No direct router verb declarations detected by pattern scan.

## googleAuth.routes.ts
- router.get("/google", oauthLimiter, safeHandler(googleAuth));

## health.routes.ts
- No direct router verb declarations detected by pattern scan.

## helpAi.routes.ts
- router.post("/", HelpAiController.reply);

## instagram.routes.ts
- No direct router verb declarations detected by pattern scan.

## instagram.webhook.ts
- router.get("/", (req: Request, res: Response) => {
- router.post("/", async (req: any, res: Response) => {

## integration.routes.ts
- router.get("/onboarding", protect, getOnboarding);
- router.get("/instagram/accounts", protect, getInstagramAccounts);
- router.get("/", protect, requirePermission("settings:view"), getIntegrations);

## knowledge.routes.ts
- router.post("/", protect, createKnowledge);
- router.get("/", protect, getKnowledge);
- router.get("/:id", protect, getSingleKnowledge);
- router.put("/:id", protect, updateKnowledge);
- router.delete("/:id", protect, deleteKnowledge);

## lead.routes.ts
- No direct router verb declarations detected by pattern scan.

## message.routes.ts
- router.get("/:leadId", getMessages);
- router.post("/send", sendManualMessage);
- router.delete("/:messageId", deleteMessage);
- router.post("/read", markConversationRead);

## notification.ts
- router.get("/", async (req, res) => {
- router.get("/settings", async (req, res) => {
- router.patch("/settings", async (req, res) => {
- router.patch("/:id/read", async (req, res) => {
- router.patch("/read-all", async (req, res) => {

## oauth.routes.ts
- router.get("/meta/callback", async (req: Request, res: Response) => {

## receptionIntake.routes.ts
- router.post("/email", buildIntakeHandler("EMAIL"));
- router.post("/form", buildIntakeHandler("FORM"));
- router.post("/voice", buildIntakeHandler("VOICE"));

## search.routes.ts
- router.get("/", async (req: any, res) => {

## security.routes.ts
- router.get("/sessions", asyncHandler(getSessions));
- router.delete("/sessions", asyncHandler(logoutAllSessions));

## training.routes.ts
- router.post("/business", protect, saveBusinessInfo);
- router.post("/faq", protect, saveFAQ);
- router.post("/settings", protect, saveAISettings);
- router.get("/business", protect, getBusinessInfo);
- router.get("/faq", protect, getFAQs);
- router.get("/settings", protect, getAISettings);

## usage.routes.ts
- router.get("/", UsageController.getUsage);

## user.routes.ts
- router.get("/me", protect, async (req: any, res) => {
- router.get("/profile", protect, async (req: any, res) => {
- router.get("/workspace", protect, async (req: any, res) => {
- router.patch("/update", protect, async (req: any, res) => {
- router.post("/change-password", protect, async (req: any, res) => {
- router.delete("/delete-account", protect, async (req: any, res) => {

## whatsapp.webhook.ts
- router.get("/", (req: Request, res: Response) => {
- router.post("/", async (req: any, res: Response) => {

