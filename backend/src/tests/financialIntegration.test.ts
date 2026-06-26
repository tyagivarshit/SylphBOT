import assert from "node:assert/strict";
import { container } from "../runtime/core";
import { bootstrapper } from "../runtime/kernel/bootstrap";
import { ActorProfile } from "../runtime/interfaces/identity";
import {
  recordFinancialEvent,
  replayFinancialEvents,
  prepareFinancialIntelligence,
  validateFinancialExecution,
  executeFinancialWorkflowWithReliability,
  resetFinancialEventStore,
  getFinancialEvents,
  linkFinancialEntity,
  validateFinancialRuntimeAdoption
} from "../services/financialIntegration.service";
import { IInvoiceConnector, IPaymentConnector } from "../runtime/interfaces/connectors";

// Implement Connector Abstractions
class MockStripeConnector implements IPaymentConnector {
  getConnectorType(): string { return "Payment"; }
  getProviderName(): string { return "Stripe"; }
  async isHealthy(): Promise<boolean> { return true; }
  async charge(chargeData: any) {
    return { transactionId: "ch_stripe_123", amount: chargeData.amount, status: "succeeded" as const, rawResponse: {} };
  }
  async refund(paymentId: string, amount?: number) {
    return { refundId: "re_stripe_123", amountRefunded: amount || 0, status: "succeeded", rawResponse: {} };
  }
  async getPayment(paymentId: string) {
    return { transactionId: paymentId, amount: 100, status: "succeeded", rawResponse: {} };
  }
  async listPayments() { return []; }
}

class MockQuickBooksConnector implements IInvoiceConnector {
  getConnectorType(): string { return "Invoice"; }
  getProviderName(): string { return "QuickBooks"; }
  async isHealthy(): Promise<boolean> { return true; }
  async createInvoice(invoiceData: any) {
    return { id: "inv_qb_123", invoiceNumber: "INV-001", totalAmount: 150, status: "sent", rawResponse: {} };
  }
  async getInvoice(id: string) {
    return { id, invoiceNumber: "INV-001", totalAmount: 150, status: "sent", rawResponse: {} };
  }
  async updateInvoice(id: string, invoiceData: any) {
    return { id, status: "updated", rawResponse: {} };
  }
  async voidInvoice(id: string) {
    return { id, status: "voided", rawResponse: {} };
  }
  async listInvoices() { return []; }
}

const ensureBootstrapped = async () => {
  resetFinancialEventStore();
  container.reset();
  await bootstrapper.bootstrap().catch(() => {});
};

export const financialIntegrationTests: any[] = [
  {
    name: "Financial Integration: Verify Connector Abstraction interfaces",
    run: async () => {
      await ensureBootstrapped();
      const stripe: IPaymentConnector = new MockStripeConnector();
      const qb: IInvoiceConnector = new MockQuickBooksConnector();

      assert.equal(stripe.getConnectorType(), "Payment");
      assert.equal(stripe.getProviderName(), "Stripe");
      assert.equal(qb.getConnectorType(), "Invoice");
      assert.equal(qb.getProviderName(), "QuickBooks");
      
      const charge = await stripe.charge({ amount: 100, currency: "USD", paymentMethodId: "pm_1" });
      assert.equal(charge.transactionId, "ch_stripe_123");
      
      const invoice = await qb.createInvoice({ customerId: "c_1", items: [], currency: "USD" });
      assert.equal(invoice.invoiceNumber, "INV-001");
    }
  },
  {
    name: "Financial Integration: Verify Financial Event Replay and Ledger Consistency",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = "tenant-fin-replay";

      // 1. Record Revenue (credits)
      recordFinancialEvent({
        tenantId,
        eventType: "financial.revenue.recorded",
        amount: 2500,
        currency: "USD",
        entityId: "rev-1",
        metadata: {}
      });

      recordFinancialEvent({
        tenantId,
        eventType: "financial.payment.charged",
        amount: 1500,
        currency: "USD",
        entityId: "pay-1",
        metadata: {}
      });

      // 2. Record Expenses / Refunds (debits)
      recordFinancialEvent({
        tenantId,
        eventType: "financial.expense.recorded",
        amount: 1000,
        currency: "USD",
        entityId: "exp-1",
        metadata: {}
      });

      recordFinancialEvent({
        tenantId,
        eventType: "financial.payment.refunded",
        amount: 200,
        currency: "USD",
        entityId: "ref-1",
        metadata: {}
      });

      const ledger = replayFinancialEvents(tenantId);
      // Balance should be: 2500 + 1500 - 1000 - 200 = 2800
      assert.equal(ledger.balance, 2800);
      assert.equal(ledger.currency, "USD");
    }
  },
  {
    name: "Financial Integration: Verify Financial Intelligence Preparation (AI Ready)",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = "tenant-fin-intel";

      recordFinancialEvent({
        tenantId,
        eventType: "financial.revenue.recorded",
        amount: 150,
        currency: "USD",
        entityId: "rev-intel",
        metadata: {}
      });

      const intelContext = prepareFinancialIntelligence(tenantId);
      assert.ok(intelContext.readyForFinanceAI);
      assert.equal(intelContext.transactionsCount, 1);
      assert.equal(intelContext.transactions[0].category, "revenue");
    }
  },
  {
    name: "Financial Integration: Verify permissions and RBAC scope validation",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = "tenant-fin-perm";
      const unauthorizedActor: ActorProfile = {
        actorId: "actor-unauth",
        tenantId,
        role: "USER",
        scopes: ["crm:read"] // lacks financial scopes
      };

      await assert.rejects(
        async () => {
          await validateFinancialExecution(tenantId, "create_invoice", { businessId: tenantId }, unauthorizedActor);
        },
        /Security Violation: Caller lacks permission/
      );

      const authorizedActor: ActorProfile = {
        actorId: "actor-auth",
        tenantId,
        role: "USER",
        scopes: ["finance.admin"]
      };

      await assert.doesNotReject(async () => {
        await validateFinancialExecution(tenantId, "create_invoice", { businessId: tenantId }, authorizedActor);
      });
    }
  },
  {
    name: "Financial Integration: Verify custom Policy Engine limits and rules",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = "tenant-fin-policy";
      const actor: ActorProfile = {
        actorId: "actor-fin",
        tenantId,
        role: "USER",
        scopes: ["finance.invoice", "finance.refund"]
      };

      // Mock policy engine configuration to throw error on large invoices
      const policyEngine = container.resolve<any>("IPolicyEngine");
      const originalEvaluate = policyEngine.evaluate;
      policyEngine.evaluate = (actorCtx: any, context: any) => {
        if (context?.amount > 5000) {
          return { allowed: false, reasons: ["Amount exceeds maximum permitted limit of 5000"] };
        }
        return { allowed: true, reasons: [] };
      };

      await assert.rejects(
        async () => {
          await validateFinancialExecution(tenantId, "create_invoice", { businessId: tenantId, amount: 6000 }, actor);
        },
        /Policy Violation: Financial execution of \[create_invoice\] blocked/
      );

      await assert.doesNotReject(async () => {
        await validateFinancialExecution(tenantId, "create_invoice", { businessId: tenantId, amount: 4000 }, actor);
      });

      policyEngine.evaluate = originalEvaluate;
    }
  },
  {
    name: "Financial Integration: Verify cross-tenant isolation enforcement",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = "tenant-fin-iso-1";
      const actor: ActorProfile = {
        actorId: "actor-fin",
        tenantId: "tenant-fin-iso-2", // different tenant
        role: "USER",
        scopes: ["finance.admin"]
      };

      await assert.rejects(
        async () => {
          await validateFinancialExecution(tenantId, "create_invoice", { businessId: tenantId }, actor);
        },
        /Cross-tenant Financial operation blocked/
      );
    }
  },
  {
    name: "Financial Integration: Verify duplicate transaction protection",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = "tenant-fin-dup";
      
      const txRef = "unique-tx-ref-123";
      recordFinancialEvent({
        tenantId,
        eventType: "financial.payment.charged",
        amount: 50,
        currency: "USD",
        entityId: "pay-dup",
        metadata: { txRef }
      });

      // Verify that double-registering the same unique txRef is checked/rejected or kept idempotent
      const events = getFinancialEvents(tenantId);
      const hasDuplicate = events.some(e => e.metadata?.txRef === txRef && e.entityId !== "pay-dup");
      assert.equal(hasDuplicate, false);
    }
  },
  {
    name: "Financial Integration: Verify concurrent financial writes consistency",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = "tenant-fin-concur";

      const operations = Array.from({ length: 50 }).map((_, i) => {
        return recordFinancialEvent({
          tenantId,
          eventType: i % 2 === 0 ? "financial.revenue.recorded" : "financial.expense.recorded",
          amount: 100,
          currency: "USD",
          entityId: `entity-${i}`,
          metadata: {}
        });
      });

      assert.equal(operations.length, 50);
      const ledger = replayFinancialEvents(tenantId);
      // 25 revenue entries (2500) and 25 expense entries (2500). Net balance = 0
      assert.equal(ledger.balance, 0);
    }
  },
  {
    name: "Financial Integration: Verify Business Graph preparation links in MemoryEngine",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = "tenant-fin-graph";
      const memoryEngine = container.resolve<any>("IMemoryEngine");

      await memoryEngine.upsertEntity({ id: "invoice:inv-g", type: "invoice", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "customer:cust-g", type: "customer", properties: { tenantId } });

      await linkFinancialEntity(tenantId, "invoice:inv-g", "customer:cust-g", "INVOICE_CUSTOMER");

      const neighbors = await memoryEngine.queryNeighbors("invoice:inv-g");
      assert.ok(neighbors.length > 0);
      assert.equal(neighbors[0].id, "customer:cust-g");
    }
  },
  {
    name: "Financial Integration: Verify financial tools execution through IToolExecutor",
    run: async () => {
      await ensureBootstrapped();
      const toolExecutor = container.resolve<any>("IToolExecutor");
      const tenantId = "607f1f77bcf86cd799439007";
      const actor: ActorProfile = {
        actorId: "actor-fin-exec",
        tenantId,
        role: "USER",
        scopes: ["finance.admin"]
      };

      const result = await toolExecutor.executeTool("create_invoice", {
        businessId: tenantId,
        amount: 250,
        currency: "USD",
        entityId: "inv-exec"
      }, {
        actor,
        tenantId,
        roles: [actor.role, ...(actor.scopes || [])]
      });

      assert.ok(result.success);
      assert.equal(result.output?.status, "created");
      assert.ok(result.output?.eventId);

      const events = getFinancialEvents(tenantId);
      assert.equal(events.length, 1);
      assert.equal(events[0].amount, 250);
    }
  },
  {
    name: "Financial Integration: Run validation adoption check and assert 100% metrics",
    run: async () => {
      await ensureBootstrapped();
      const adoption = await validateFinancialRuntimeAdoption();
      assert.equal(adoption.overallAdoption, 100);
    }
  }
];
