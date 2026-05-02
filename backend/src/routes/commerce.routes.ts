import { Router } from "express";
import { CommerceController } from "../controllers/commerce.controller";
import { protect } from "../middleware/auth.middleware";
import { requireBusinessContext } from "../middleware/tenant.middleware";
import { requirePermission } from "../middleware/rbac.middleware";

const router = Router();

router.use(protect);
router.use(requireBusinessContext);

router.post("/proposal", requirePermission("billing:manage"), CommerceController.createProposal);
router.post("/proposal/:proposalKey/send", requirePermission("billing:manage"), CommerceController.sendProposal);
router.post("/proposal/:proposalKey/accept", requirePermission("billing:manage"), CommerceController.acceptProposal);
router.post("/discount/:approvalKey/decision", requirePermission("billing:manage"), CommerceController.decideDiscount);
router.post("/contract/from-proposal", requirePermission("billing:manage"), CommerceController.generateContract);
router.post("/contract/:contractKey/signature", requirePermission("billing:manage"), CommerceController.requestSignature);
router.post("/signature/:signatureKey/signed", requirePermission("billing:manage"), CommerceController.markSigned);
router.post("/checkout", requirePermission("billing:manage"), CommerceController.createCheckout);
router.post("/invoice", requirePermission("billing:manage"), CommerceController.issueInvoice);
router.post("/subscription", requirePermission("billing:manage"), CommerceController.createSubscription);
router.post("/subscription/:subscriptionKey/action", requirePermission("billing:manage"), CommerceController.subscriptionAction);
router.post("/dunning/run", requirePermission("billing:manage"), CommerceController.runDunning);
router.post("/refund", requirePermission("billing:manage"), CommerceController.requestRefund);
router.post("/checkout/recover", requirePermission("billing:manage"), CommerceController.recoverCheckout);
router.post("/ops/manual-retry", requirePermission("billing:manage"), CommerceController.manualRetryPayment);
router.post("/ops/manual-credit", requirePermission("billing:manage"), CommerceController.manualCredit);
router.post("/ops/subscription-override", requirePermission("billing:manage"), CommerceController.manualSubscriptionOverride);
router.post("/ops/replay-pending-webhooks", requirePermission("billing:manage"), CommerceController.replayPendingWebhooks);
router.post("/ops/replay-pending-entitlements", requirePermission("billing:manage"), CommerceController.replayPendingEntitlements);
router.post("/reconcile-webhook", requirePermission("billing:manage"), CommerceController.reconcileWebhook);
router.get("/projection", requirePermission("billing:view"), CommerceController.getProjection);
router.post("/chargeback", requirePermission("billing:manage"), CommerceController.openChargeback);
router.post("/provider-credential", requirePermission("billing:manage"), CommerceController.upsertProviderCredential);
router.post("/override", requirePermission("billing:manage"), CommerceController.createManualOverride);

export default router;
