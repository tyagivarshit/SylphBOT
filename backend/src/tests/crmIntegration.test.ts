import assert from "node:assert/strict";
import prisma from "../config/prisma";
import { container } from "../runtime/core";
import { bootstrapper } from "../runtime/kernel/bootstrap";
import { MemoryEngine } from "../runtime/intelligence/memoryEngine";
import { EventBus } from "../runtime/communication/eventBus";
import { ToolRegistry } from "../runtime/execution/toolRegistry";
import { MetricsEngine } from "../runtime/observability/metricsEngine";
import { ActorProfile } from "../runtime/interfaces/identity";
import {
  createLead,
  updateLead,
  deleteLead,
  qualifyLead,
  movePipeline,
  retrieveCustomer,
  mergeCustomer,
  searchCustomer,
  linkConversation,
  attachKnowledge,
  linkCompany,
  linkPayment,
  linkCampaign,
  linkBooking,
  linkDeal,
  linkSupportCase,
  createDeal,
  wonDeal,
  lostDeal,
  updateContact,
  validateCrmRuntimeAdoption,
  linkConversationKnowledge,
  linkConversationCrm,
  linkConversationCampaign,
  linkConversationBooking,
  linkConversationPayment,
  linkConversationSupportCase,
  linkConversationAIDecision,
  linkConversationTimeline,
} from "../services/crm/crmIntegration.service";

// In-Memory mock storage for Prisma during CRM integration testing
const mockBusinesses: any[] = [];
const mockUsers: any[] = [];
const mockLeads: any[] = [];

// Helper function to recursively match queries in memory
const matchesQuery = (item: any, where: any): boolean => {
  if (!where) return true;

  for (const [key, value] of Object.entries(where)) {
    if (key === "AND") {
      if (Array.isArray(value)) {
        if (!value.every(sub => matchesQuery(item, sub))) return false;
      }
    } else if (key === "OR") {
      if (Array.isArray(value)) {
        if (!value.some(sub => matchesQuery(item, sub))) return false;
      }
    } else if (key === "NOT") {
      if (typeof value === "object" && value !== null) {
        if (matchesQuery(item, value)) return false;
      }
    } else {
      const fieldVal = item[key];
      if (typeof value === "object" && value !== null) {
        const ops = value as any;
        if (ops.in && Array.isArray(ops.in)) {
          if (!ops.in.includes(fieldVal)) return false;
        }
        if (ops.contains && typeof ops.contains === "string") {
          if (!String(fieldVal || "").toLowerCase().includes(ops.contains.toLowerCase())) return false;
        }
        if (ops.not !== undefined) {
          if (fieldVal === ops.not) return false;
        }
      } else {
        if (fieldVal !== value) return false;
      }
    }
  }

  return true;
};

// Stashing original Prisma operations
const originalBusinessFindFirst = prisma.business.findFirst;
const originalBusinessFindMany = prisma.business.findMany;
const originalBusinessCreate = prisma.business.create;
const originalBusinessDelete = prisma.business.delete;
const originalUserCreate = prisma.user.create;
const originalUserDelete = prisma.user.delete;

const originalLeadFindFirst = prisma.lead.findFirst;
const originalLeadFindUnique = prisma.lead.findUnique;
const originalLeadFindMany = prisma.lead.findMany;
const originalLeadCreate = prisma.lead.create;
const originalLeadUpdate = prisma.lead.update;
const originalLeadDelete = prisma.lead.delete;

const setupPrismaMocks = () => {
  (prisma.business as any).findFirst = async (args?: any) => {
    const item = mockBusinesses.find(b => matchesQuery(b, args?.where));
    if (!item) return null;
    const business = { ...item };
    if (args?.include?.owner) {
      business.owner = mockUsers.find(u => u.id === business.ownerId);
    }
    return business;
  };

  (prisma.business as any).findMany = async (args?: any) => {
    const list = mockBusinesses.filter(b => matchesQuery(b, args?.where));
    return list.map(b => ({ ...b }));
  };

  (prisma.business as any).create = async (args: any) => {
    const business = {
      id: `business-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      name: args.data.name,
      ownerId: args.data.ownerId,
    };
    mockBusinesses.push(business);
    return business;
  };

  (prisma.business as any).delete = async (args: any) => {
    const idx = mockBusinesses.findIndex(b => b.id === args.where.id);
    if (idx !== -1) mockBusinesses.splice(idx, 1);
    return { id: args.where.id };
  };

  (prisma.user as any).create = async (args: any) => {
    const user = {
      id: `user-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      email: args.data.email,
      name: args.data.name,
      role: args.data.role,
    };
    mockUsers.push(user);
    return user;
  };

  (prisma.user as any).delete = async (args: any) => {
    const idx = mockUsers.findIndex(u => u.id === args.where.id || u.email === args.where.email);
    if (idx !== -1) mockUsers.splice(idx, 1);
    return { id: args.where.id || args.where.email };
  };

  // Lead mocks
  (prisma.lead as any).findFirst = async (args?: any) => {
    const item = mockLeads.find(l => matchesQuery(l, args?.where));
    return item ? { ...item } : null;
  };

  (prisma.lead as any).findUnique = async (args?: any) => {
    const item = mockLeads.find(l => matchesQuery(l, args?.where));
    return item ? { ...item } : null;
  };

  (prisma.lead as any).findMany = async (args?: any) => {
    const list = mockLeads.filter(l => matchesQuery(l, args?.where));
    return list.map(l => ({ ...l }));
  };

  (prisma.lead as any).create = async (args: any) => {
    const lead = {
      id: `lead-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      ...args.data,
      createdAt: new Date(),
    };
    mockLeads.push(lead);
    return { ...lead };
  };

  (prisma.lead as any).update = async (args: any) => {
    const lead = mockLeads.find(l => l.id === args.where.id);
    if (!lead) throw new Error(`Lead ${args.where.id} not found`);
    Object.assign(lead, args.data);
    return { ...lead };
  };

  (prisma.lead as any).delete = async (args: any) => {
    const idx = mockLeads.findIndex(l => l.id === args.where.id);
    if (idx !== -1) {
      const removed = mockLeads.splice(idx, 1)[0];
      return { ...removed };
    }
    return { id: args.where.id };
  };
};

const restorePrismaMocks = () => {
  (prisma.business as any).findFirst = originalBusinessFindFirst;
  (prisma.business as any).findMany = originalBusinessFindMany;
  (prisma.business as any).create = originalBusinessCreate;
  (prisma.business as any).delete = originalBusinessDelete;
  (prisma.user as any).create = originalUserCreate;
  (prisma.user as any).delete = originalUserDelete;

  (prisma.lead as any).findFirst = originalLeadFindFirst;
  (prisma.lead as any).findUnique = originalLeadFindUnique;
  (prisma.lead as any).findMany = originalLeadFindMany;
  (prisma.lead as any).create = originalLeadCreate;
  (prisma.lead as any).update = originalLeadUpdate;
  (prisma.lead as any).delete = originalLeadDelete;
};

const ensureBootstrapped = async () => {
  setupPrismaMocks();
  if (!container.has("IMemoryEngine")) {
    await bootstrapper.bootstrap().catch(() => {});
  }
};

export const crmIntegrationTests: any[] = [
  {
    name: "CRM Integration: verify identity resolution and channel mapping across systems",
    run: async () => {
      await ensureBootstrapped();
      const identityEngine = container.resolve<any>("IIdentityEngineInstance");
      assert.ok(identityEngine);

      const tenantId = `tenant-${Date.now()}`;
      
      // Resolve whatsapp identity
      const id1 = identityEngine.resolveIdentity(tenantId, "WhatsApp", "+1234567890");
      assert.ok(id1.unifiedId);
      assert.equal(id1.verified, false);

      // Resolve instagram identity
      const id2 = identityEngine.resolveIdentity(tenantId, "Instagram", "insta_user_123");
      assert.notEqual(id1.unifiedId, id2.unifiedId);

      // Link new channel to id1
      const linked = identityEngine.linkIdentity(id1.unifiedId, tenantId, "Email", "user@example.com");
      assert.equal(linked.channels.get("Email"), "user@example.com");
      assert.equal(linked.channels.get("WhatsApp"), "+1234567890");

      // Verify lookup works
      const lookedUp = identityEngine.lookup(id1.unifiedId);
      assert.ok(lookedUp);
      assert.equal(lookedUp.channels.get("Email"), "user@example.com");

      // Reset mocks
      restorePrismaMocks();
    }
  },
  {
    name: "CRM Integration: verify customer records in IMemoryEngine and CRUD flows",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = `tenant-${Date.now()}`;

      // Create lead (which creates profile and lifecycle records in MemoryEngine)
      const res = await createLead(tenantId, {
        name: "Rohan",
        email: "rohan@example.com",
        phone: "+918888888888",
        platform: "WHATSAPP",
      });

      assert.ok(res.lead.id);
      assert.ok(res.identity.unifiedId);

      // Verify it exists in IMemoryEngine
      const memoryEngine = container.resolve<any>("IMemoryEngine");
      const profileMem = await memoryEngine.readMemory(tenantId, "customer", `profile:${res.lead.id}`);
      assert.ok(profileMem);
      
      const profile = JSON.parse(profileMem.value);
      assert.equal(profile.name, "Rohan");
      assert.equal(profile.email, "rohan@example.com");

      // Update lead
      await updateLead(tenantId, res.lead.id, {
        name: "Rohan Malhotra"
      });

      const updatedMem = await memoryEngine.readMemory(tenantId, "customer", `profile:${res.lead.id}`);
      assert.equal(JSON.parse(updatedMem.value).name, "Rohan Malhotra");

      // Retrieve customer fallback verification
      const retrieved = await retrieveCustomer(tenantId, res.lead.id);
      assert.equal(retrieved.name, "Rohan Malhotra");

      restorePrismaMocks();
    }
  },
  {
    name: "CRM Integration: verify duplicate merging and identities unification",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = `tenant-${Date.now()}`;

      // Create primary lead
      const primary = await createLead(tenantId, {
        name: "Alice",
        phone: "+15550001111",
      });

      // Create secondary lead
      const secondary = await createLead(tenantId, {
        name: "Alice Dup",
        phone: "+15550002222",
      });

      // Merge secondary into primary
      const mergeRes = await mergeCustomer(tenantId, primary.lead.id, secondary.lead.id);
      assert.equal(mergeRes.primaryLeadId, primary.lead.id);

      // Verify secondary is soft-deleted
      const deletedLead = mockLeads.find(l => l.id === secondary.lead.id);
      assert.ok(deletedLead.deletedAt);

      restorePrismaMocks();
    }
  },
  {
    name: "CRM Integration: verify Event Bus integration publishes proper contracts",
    run: async () => {
      await ensureBootstrapped();
      const eventBus = container.resolve<any>("IEventBus");
      
      let leadCreatedFired = false;
      let customerCreatedFired = false;
      let conversionFired = false;

      eventBus.subscribe("lead.created", async (envelope: any) => {
        leadCreatedFired = true;
      });

      eventBus.subscribe("customer.created", async (envelope: any) => {
        customerCreatedFired = true;
      });

      eventBus.subscribe("customer.converted", async (envelope: any) => {
        conversionFired = true;
      });

      const tenantId = `tenant-${Date.now()}`;
      const res = await createLead(tenantId, {
        name: "Bob",
        email: "bob@example.com",
      });

      await qualifyLead(tenantId, res.lead.id);

      // Small delay for async event loop
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.ok(leadCreatedFired);
      assert.ok(customerCreatedFired);
      assert.ok(conversionFired);

      restorePrismaMocks();
    }
  },
  {
    name: "CRM Integration: verify Tool Registry tool executions",
    run: async () => {
      await ensureBootstrapped();
      const toolRegistry = container.resolve<any>("IToolRegistry");
      assert.ok(toolRegistry instanceof ToolRegistry);

      const tools = toolRegistry.listTools().map((t: any) => t.name);
      assert.ok(tools.includes("search_customer"));
      assert.ok(tools.includes("create_lead"));
      assert.ok(tools.includes("update_lead"));
      assert.ok(tools.includes("qualify_lead"));
      assert.ok(tools.includes("move_pipeline"));
      assert.ok(tools.includes("retrieve_customer"));
      assert.ok(tools.includes("merge_customer"));
      assert.ok(tools.includes("link_conversation"));
      assert.ok(tools.includes("attach_knowledge"));

      restorePrismaMocks();
    }
  },
  {
    name: "CRM Integration: verify Permission Engine actor and tenant isolation rules",
    run: async () => {
      await ensureBootstrapped();
      const tenantA = "tenant_A";
      const tenantB = "tenant_B";

      const actorB: ActorProfile = {
        actorId: "actor-b",
        tenantId: tenantB,
        role: "USER",
        scopes: ["crm:write"],
      };

      // Operations belonging to Tenant A attempted by Actor B must throw errors
      await assert.rejects(
        async () => {
          await createLead(tenantA, { name: "Hack attempt" }, actorB);
        },
        /Cross-tenant CRM operation blocked/
      );

      await assert.rejects(
        async () => {
          await updateLead(tenantA, "some-lead", { name: "Hack attempt" }, actorB);
        },
        /Cross-tenant CRM operation blocked/
      );

      restorePrismaMocks();
    }
  },
  {
    name: "CRM Integration: verify Observability MetricsEngine telemetry collections",
    run: async () => {
      await ensureBootstrapped();
      const metricsEngine = container.resolve<any>("IMetricsEngine");
      assert.ok(metricsEngine instanceof MetricsEngine);

      // Record CRM metrics
      metricsEngine.clear();
      metricsEngine.recordCRMMetric("lead_creation_latency", 40);
      metricsEngine.recordCRMMetric("customer_lookup_latency", 15);
      metricsEngine.recordCRMMetric("pipeline_update_latency", 25);
      metricsEngine.recordCRMMetric("conversion_event", 1);
      metricsEngine.recordCRMMetric("duplicate_merge", 2);
      metricsEngine.recordCRMMetric("crm_failure", 0);

      const summary = metricsEngine.getCRMMetricsSummary();
      assert.equal(summary.averageLeadCreationLatencyMs, 40);
      assert.equal(summary.averageCustomerLookupLatencyMs, 15);
      assert.equal(summary.averagePipelineUpdateLatencyMs, 25);
      assert.equal(summary.conversionEvents, 1);
      assert.equal(summary.duplicateMerges, 2);
      assert.equal(summary.crmFailures, 0);

      // Record Conversation observability metrics
      metricsEngine.recordConversationMetric("memory_retrieval_latency", 12);
      metricsEngine.recordConversationMetric("prompt_compilation_latency", 18);
      metricsEngine.recordConversationMetric("model_latency", 120);
      metricsEngine.recordConversationMetric("message_throughput", 45);
      metricsEngine.recordConversationMetric("conversation_failure", 3);
      metricsEngine.recordConversationMetric("escalation", 1);

      const convSummary = metricsEngine.getConversationMetricsSummary();
      assert.equal(convSummary.averageMemoryRetrievalLatencyMs, 12);
      assert.equal(convSummary.averagePromptCompilationLatencyMs, 18);
      assert.equal(convSummary.averageModelLatencyMs, 120);
      assert.equal(convSummary.messageThroughput, 45);
      assert.equal(convSummary.conversationFailures, 3);
      assert.equal(convSummary.escalationFrequency, 1);

      restorePrismaMocks();
    }
  },
  {
    name: "CRM Integration: verify Business Graph prepare relationship links",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = `tenant-${Date.now()}`;
      const leadId = "lead-1";
      const convId = "conv-1";

      const memoryEngine = container.resolve<any>("IMemoryEngine");
      // Register entity nodes in graph memory first so queryNeighbors can resolve them
      await memoryEngine.upsertEntity({ id: `customer:${leadId}`, type: "customer", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "company:company-1", type: "company", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "payment:payment-1", type: "payment", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "campaign:campaign-1", type: "campaign", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "booking:booking-1", type: "booking", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "deal:deal-1", type: "deal", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "case:case-1", type: "case", properties: { tenantId } });

      await linkCompany(tenantId, leadId, "company-1");
      await linkPayment(tenantId, leadId, "payment-1");
      await linkCampaign(tenantId, leadId, "campaign-1");
      await linkBooking(tenantId, leadId, "booking-1");
      await linkDeal(tenantId, leadId, "deal-1");
      await linkSupportCase(tenantId, leadId, "case-1");

      const neighbors = await memoryEngine.queryNeighbors(`customer:${leadId}`);
      assert.ok(neighbors.length > 0);

      // Phase 10: Conversation topology preparation checks
      await memoryEngine.upsertEntity({ id: `conversation:${convId}`, type: "conversation", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "knowledge:kb-1", type: "knowledge", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "decision:dec-1", type: "decision", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "timeline:tl-1", type: "timeline", properties: { tenantId } });

      await linkConversationKnowledge(tenantId, convId, "kb-1");
      await linkConversationCrm(tenantId, convId, leadId);
      await linkConversationCampaign(tenantId, convId, "campaign-1");
      await linkConversationBooking(tenantId, convId, "booking-1");
      await linkConversationPayment(tenantId, convId, "payment-1");
      await linkConversationSupportCase(tenantId, convId, "case-1");
      await linkConversationAIDecision(tenantId, convId, "dec-1");
      await linkConversationTimeline(tenantId, convId, "tl-1");

      const convNeighbors = await memoryEngine.queryNeighbors(`conversation:${convId}`);
      assert.ok(convNeighbors.length > 0);

      restorePrismaMocks();
    }
  },
  {
    name: "CRM Integration: run Runtime Validation and return 100% adoption metrics",
    run: async () => {
      await ensureBootstrapped();
      const report = await validateCrmRuntimeAdoption();
      assert.equal(report.identityEngineAdoption, 100);
      assert.equal(report.memoryEngineAdoption, 100);
      assert.equal(report.eventBusAdoption, 100);
      assert.equal(report.toolRegistryAdoption, 100);
      assert.equal(report.permissionAdoption, 100);
      assert.equal(report.observabilityAdoption, 100);
      assert.equal(report.overallAdoption, 100);

      console.log("[Runtime Validation Success] CRM Base Adoption is 100%!");
      console.log(JSON.stringify(report, null, 2));

      restorePrismaMocks();
    }
  }
];
