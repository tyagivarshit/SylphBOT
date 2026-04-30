import { Request, Response } from "express";
import { chargebackEngineService } from "../services/chargebackEngine.service";
import { checkoutRecoveryService } from "../services/checkoutRecovery.service";
import { commerceAuthorityService } from "../services/commerceAuthority.service";
import { commerceProjectionService } from "../services/commerceProjection.service";
import { contractEngineService } from "../services/contractEngine.service";
import { dunningEngineService } from "../services/dunningEngine.service";
import { invoiceEngineService } from "../services/invoiceEngine.service";
import { paymentIntentService } from "../services/paymentIntent.service";
import { proposalEngineService } from "../services/proposalEngine.service";
import { refundEngineService } from "../services/refundEngine.service";
import { signatureEngineService } from "../services/signatureEngine.service";
import { subscriptionEngineService } from "../services/subscriptionEngine.service";

const getBusinessId = (req: Request) => String(req.user?.businessId || "").trim();

const parseDate = (value: unknown, fallback: Date) => {
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

export class CommerceController {
  static async createProposal(req: Request, res: Response) {
    try {
      const businessId = getBusinessId(req);

      if (!businessId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const proposal = await proposalEngineService.createProposal({
        businessId,
        leadId: req.body?.leadId || null,
        planCode: req.body?.planCode,
        billingCycle: req.body?.billing,
        currency: req.body?.currency,
        quantity: req.body?.quantity,
        discountPercent: req.body?.discountPercent,
        customUnitPriceMinor: req.body?.customUnitPriceMinor,
        lineItems: req.body?.lineItems,
        source: req.body?.source,
        requestedBy: req.body?.requestedBy,
        metadata: req.body?.metadata,
        idempotencyKey: req.body?.idempotencyKey,
      });

      return res.status(201).json({
        success: true,
        data: {
          proposal,
        },
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message || "proposal_failed" });
    }
  }

  static async sendProposal(req: Request, res: Response) {
    try {
      const businessId = getBusinessId(req);
      const proposalKey = String(req.params.proposalKey || "").trim();
      const proposal = await proposalEngineService.sendProposal({
        businessId,
        proposalKey,
      });

      return res.json({ success: true, data: { proposal } });
    } catch (error: any) {
      return res.status(409).json({ success: false, message: error.message || "send_failed" });
    }
  }

  static async acceptProposal(req: Request, res: Response) {
    try {
      const businessId = getBusinessId(req);
      const proposalKey = String(req.params.proposalKey || "").trim();
      const proposal = await proposalEngineService.acceptProposal({
        businessId,
        proposalKey,
        acceptedBy: req.body?.acceptedBy,
        metadata: req.body?.metadata,
      });

      return res.json({ success: true, data: { proposal } });
    } catch (error: any) {
      return res.status(409).json({ success: false, message: error.message || "accept_failed" });
    }
  }

  static async decideDiscount(req: Request, res: Response) {
    try {
      const businessId = getBusinessId(req);
      const approvalKey = String(req.params.approvalKey || "").trim();
      const approval = await proposalEngineService.decideDiscountApproval({
        businessId,
        approvalKey,
        approved: Boolean(req.body?.approved),
        decidedBy: req.body?.decidedBy,
        approvedPercent: req.body?.approvedPercent,
        reason: req.body?.reason,
        metadata: req.body?.metadata,
      });

      return res.json({ success: true, data: { approval } });
    } catch (error: any) {
      return res.status(409).json({ success: false, message: error.message || "discount_decision_failed" });
    }
  }

  static async generateContract(req: Request, res: Response) {
    try {
      const businessId = getBusinessId(req);
      const contract = await contractEngineService.generateFromProposal({
        businessId,
        proposalKey: req.body?.proposalKey,
        templateKey: req.body?.templateKey,
        templateVersion: req.body?.templateVersion,
        source: req.body?.source,
        metadata: req.body?.metadata,
        idempotencyKey: req.body?.idempotencyKey,
      });

      return res.status(201).json({ success: true, data: { contract } });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message || "contract_generation_failed" });
    }
  }

  static async requestSignature(req: Request, res: Response) {
    try {
      const businessId = getBusinessId(req);
      const contractKey = String(req.params.contractKey || "").trim();
      const signature = await signatureEngineService.requestSignature({
        businessId,
        contractKey,
        signerEmail: req.body?.signerEmail,
        signerName: req.body?.signerName,
        signerRole: req.body?.signerRole,
        provider: req.body?.provider,
        expiresInHours: req.body?.expiresInHours,
        metadata: req.body?.metadata,
        idempotencyKey: req.body?.idempotencyKey,
      });

      return res.status(201).json({ success: true, data: { signature } });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message || "signature_request_failed" });
    }
  }

  static async markSigned(req: Request, res: Response) {
    try {
      const businessId = getBusinessId(req);
      const signatureKey = String(req.params.signatureKey || "").trim();
      const signature = await signatureEngineService.markSigned({
        businessId,
        signatureKey,
        providerSignatureId: req.body?.providerSignatureId,
        metadata: req.body?.metadata,
      });

      return res.json({ success: true, data: { signature } });
    } catch (error: any) {
      return res.status(409).json({ success: false, message: error.message || "signature_update_failed" });
    }
  }

  static async createCheckout(req: Request, res: Response) {
    try {
      const businessId = getBusinessId(req);
      const paymentIntent = await paymentIntentService.createCheckout({
        businessId,
        proposalKey: req.body?.proposalKey,
        provider: req.body?.provider,
        source: req.body?.source,
        description: req.body?.description,
        successUrl: req.body?.successUrl,
        cancelUrl: req.body?.cancelUrl,
        metadata: req.body?.metadata,
        idempotencyKey: req.body?.idempotencyKey,
      });

      return res.status(201).json({
        success: true,
        data: {
          paymentIntent,
          checkoutUrl: paymentIntent.checkoutUrl,
        },
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message || "checkout_failed" });
    }
  }

  static async issueInvoice(req: Request, res: Response) {
    try {
      const businessId = getBusinessId(req);
      const invoice = await invoiceEngineService.issueInvoice({
        businessId,
        proposalKey: req.body?.proposalKey,
        contractKey: req.body?.contractKey,
        subscriptionKey: req.body?.subscriptionKey,
        dueDays: req.body?.dueDays,
        metadata: req.body?.metadata,
        idempotencyKey: req.body?.idempotencyKey,
      });

      return res.status(201).json({ success: true, data: { invoice } });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message || "invoice_failed" });
    }
  }

  static async createSubscription(req: Request, res: Response) {
    try {
      const businessId = getBusinessId(req);
      const subscription = await subscriptionEngineService.createFromContract({
        businessId,
        contractKey: req.body?.contractKey,
        planCode: req.body?.planCode,
        billingCycle: req.body?.billing,
        currency: req.body?.currency,
        unitPriceMinor: req.body?.unitPriceMinor,
        quantity: req.body?.quantity,
        provider: req.body?.provider,
        metadata: req.body?.metadata,
        idempotencyKey: req.body?.idempotencyKey,
      });

      return res.status(201).json({ success: true, data: { subscription } });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message || "subscription_failed" });
    }
  }

  static async subscriptionAction(req: Request, res: Response) {
    try {
      const businessId = getBusinessId(req);
      const subscriptionKey = String(req.params.subscriptionKey || "").trim();
      const subscription = await subscriptionEngineService.applyLifecycleAction({
        businessId,
        subscriptionKey,
        action: req.body?.action,
        metadata: req.body?.metadata,
      });

      return res.json({ success: true, data: { subscription } });
    } catch (error: any) {
      return res.status(409).json({ success: false, message: error.message || "subscription_action_failed" });
    }
  }

  static async runDunning(req: Request, res: Response) {
    try {
      const businessId = getBusinessId(req);
      const result = await dunningEngineService.runFailedPaymentLadder({
        businessId,
      });

      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "dunning_failed" });
    }
  }

  static async requestRefund(req: Request, res: Response) {
    try {
      const businessId = getBusinessId(req);
      const refund = await refundEngineService.requestRefund({
        businessId,
        paymentIntentKey: req.body?.paymentIntentKey,
        invoiceKey: req.body?.invoiceKey,
        amountMinor: req.body?.amountMinor,
        reason: req.body?.reason,
        requestedBy: req.body?.requestedBy,
        metadata: req.body?.metadata,
        idempotencyKey: req.body?.idempotencyKey,
      });

      return res.status(201).json({ success: true, data: { refund } });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message || "refund_failed" });
    }
  }

  static async recoverCheckout(req: Request, res: Response) {
    try {
      const businessId = getBusinessId(req);
      const recovered = await checkoutRecoveryService.recoverCheckout({
        businessId,
        paymentIntentKey: req.body?.paymentIntentKey,
        provider: req.body?.provider,
        recoveredBy: req.body?.recoveredBy,
      });

      return res.status(201).json({ success: true, data: { recovered } });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message || "checkout_recovery_failed" });
    }
  }

  static async reconcileWebhook(req: Request, res: Response) {
    try {
      const businessId = getBusinessId(req);
      const result = await commerceProjectionService.reconcileProviderWebhook({
        provider: req.body?.provider,
        headers: req.headers as any,
        body: req.body,
        strictBusinessId: businessId || null,
      });

      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "webhook_reconcile_failed" });
    }
  }

  static async getProjection(req: Request, res: Response) {
    try {
      const businessId = getBusinessId(req);
      const from = parseDate(req.query.from, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      const to = parseDate(req.query.to, new Date());
      const projection = await commerceProjectionService.buildProjection({
        businessId,
        from,
        to,
      });

      return res.json({ success: true, data: projection });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "projection_failed" });
    }
  }

  static async openChargeback(req: Request, res: Response) {
    try {
      const businessId = getBusinessId(req);
      const chargeback = await chargebackEngineService.openChargeback({
        businessId,
        paymentIntentId: req.body?.paymentIntentId || null,
        invoiceId: req.body?.invoiceId || null,
        provider: req.body?.provider,
        providerCaseId: req.body?.providerCaseId,
        amountMinor: req.body?.amountMinor,
        currency: req.body?.currency,
        reasonCode: req.body?.reasonCode,
        evidenceDueAt: req.body?.evidenceDueAt ? new Date(req.body.evidenceDueAt) : null,
        metadata: req.body?.metadata,
        idempotencyKey: req.body?.idempotencyKey,
      });

      return res.status(201).json({ success: true, data: { chargeback } });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message || "chargeback_failed" });
    }
  }

  static async upsertProviderCredential(req: Request, res: Response) {
    try {
      const businessId = getBusinessId(req);

      const credential = await commerceAuthorityService.upsertProviderCredential({
        businessId,
        provider: req.body?.provider,
        accessTokenRef: req.body?.accessTokenRef || null,
        refreshTokenRef: req.body?.refreshTokenRef || null,
        signingSecretRef: req.body?.signingSecretRef || null,
        scope: req.body?.scope || null,
        expiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt) : null,
        revoked: Boolean(req.body?.revoked),
        status: req.body?.status || null,
        providerMetadata: req.body?.providerMetadata || null,
      });

      return res.status(201).json({
        success: true,
        data: {
          credential,
        },
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || "provider_credential_upsert_failed",
      });
    }
  }

  static async createManualOverride(req: Request, res: Response) {
    try {
      const businessId = getBusinessId(req);

      const override = await commerceAuthorityService.createManualOverride({
        businessId,
        scope: req.body?.scope,
        reason: req.body?.reason,
        expiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt) : new Date(Date.now() + 4 * 60 * 60 * 1000),
        priority: req.body?.priority,
        source: req.body?.source || "HUMAN",
        provider: req.body?.provider || "ALL",
        createdBy: String(req.user?.id || "").trim() || null,
        metadata: req.body?.metadata || null,
      });

      return res.status(201).json({
        success: true,
        data: {
          override,
        },
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || "manual_override_failed",
      });
    }
  }
}
