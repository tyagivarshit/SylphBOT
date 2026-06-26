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
  retrieveConversation,
  appendMessage,
  searchMessages,
  summarizeConversation,
  updateSummary,
  attachContext,
  retrieveContext,
  generateReply,
  handoffConversation,
  closeConversation,
  linkConversationKnowledge,
  linkConversationCrm,
  linkConversationCampaign,
  linkConversationBooking,
  linkConversationPayment,
  linkConversationSupportCase,
  linkConversationAIDecision,
  linkConversationTimeline,
  validateConversationRuntimeAdoption
} from "../services/conversationIntegration.service";

// In-Memory mock storage for Prisma during Conversation integration testing
const mockBusinesses: any[] = [];
const mockUsers: any[] = [];
const mockLeads: any[] = [];
const mockMessages: any[] = [];
const mockSummaries: any[] = [];

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

const originalMessageFindMany = prisma.message.findMany;
const originalMessageCreate = prisma.message.create;
const originalMessageDeleteMany = prisma.message.deleteMany;

const originalSummaryFindFirst = prisma.conversationSummary.findFirst;
const originalSummaryCreate = prisma.conversationSummary.create;
const originalSummaryUpdate = prisma.conversationSummary.update;

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

  // Message mocks
  (prisma.message as any).findMany = async (args?: any) => {
    let list = mockMessages.filter(m => matchesQuery(m, args?.where));
    if (args?.orderBy?.createdAt === "desc") {
      list = [...list].reverse();
    }
    if (args?.skip) {
      list = list.slice(args.skip);
    }
    if (args?.take) {
      list = list.slice(0, args.take);
    }
    return list.map(m => ({ ...m }));
  };

  (prisma.message as any).create = async (args: any) => {
    const msg = {
      id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      ...args.data,
      createdAt: new Date(),
    };
    mockMessages.push(msg);
    return { ...msg };
  };

  (prisma.message as any).deleteMany = async (args?: any) => {
    let deletedCount = 0;
    for (let i = mockMessages.length - 1; i >= 0; i--) {
      if (matchesQuery(mockMessages[i], args?.where)) {
        mockMessages.splice(i, 1);
        deletedCount++;
      }
    }
    return { count: deletedCount };
  };

  // ConversationSummary mocks
  (prisma.conversationSummary as any).findFirst = async (args?: any) => {
    const item = mockSummaries.find(s => matchesQuery(s, args?.where));
    return item ? { ...item } : null;
  };

  (prisma.conversationSummary as any).create = async (args: any) => {
    const summary = {
      id: `summary-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      ...args.data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockSummaries.push(summary);
    return { ...summary };
  };

  (prisma.conversationSummary as any).update = async (args: any) => {
    const summary = mockSummaries.find(s => s.id === args.where.id);
    if (!summary) throw new Error(`Summary ${args.where.id} not found`);
    Object.assign(summary, args.data);
    summary.updatedAt = new Date();
    return { ...summary };
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

  (prisma.message as any).findMany = originalMessageFindMany;
  (prisma.message as any).create = originalMessageCreate;
  (prisma.message as any).deleteMany = originalMessageDeleteMany;

  (prisma.conversationSummary as any).findFirst = originalSummaryFindFirst;
  (prisma.conversationSummary as any).create = originalSummaryCreate;
  (prisma.conversationSummary as any).update = originalSummaryUpdate;
};

const ensureBootstrapped = async () => {
  setupPrismaMocks();
  if (!container.has("IMemoryEngine")) {
    await bootstrapper.bootstrap().catch(() => {});
  }
};

export const conversationIntegrationTests: any[] = [
  {
    name: "Conversation Integration: verify conversation message timeline flows using MemoryEngine",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = `tenant-${Date.now()}`;
      const leadId = `lead-${Date.now()}`;

      // Append messages
      await appendMessage(tenantId, leadId, { sender: "USER", content: "Hello AI!" });
      await appendMessage(tenantId, leadId, { sender: "AI", content: "Hello User!" });

      // Retrieve history from Memory Timeline
      const messages = await retrieveConversation(tenantId, leadId);
      assert.ok(messages.length >= 2);
      assert.equal(messages[0].sender, "USER");
      assert.equal(messages[0].content, "Hello AI!");

      // Search database messages
      const found = await searchMessages(tenantId, leadId, "Hello");
      assert.ok(found.length >= 2);

      restorePrismaMocks();
    }
  },
  {
    name: "Conversation Integration: verify context routing and context attachment",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = `tenant-${Date.now()}`;
      const leadId = `lead-${Date.now()}`;

      // Attach context key-value
      await attachContext(tenantId, leadId, "user_preference", "likes_dark_mode");

      // Retrieve context back
      const val = await retrieveContext(tenantId, leadId, "user_preference");
      assert.equal(val, "likes_dark_mode");

      restorePrismaMocks();
    }
  },
  {
    name: "Conversation Integration: verify prompt compilation and safe reply generation",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = `tenant-${Date.now()}`;
      const leadId = `lead-${Date.now()}`;

      // Set up a mock lead in memory DB
      await prisma.lead.create({
        data: {
          id: leadId,
          businessId: tenantId,
          platform: "WHATSAPP",
          stage: "NEW",
        }
      } as any);

      // Append initial message
      await appendMessage(tenantId, leadId, { sender: "USER", content: "Hi" });

      // Generate Reply
      const reply = await generateReply(tenantId, leadId, "Can you help me?");
      assert.ok(reply);

      restorePrismaMocks();
    }
  },
  {
    name: "Conversation Integration: verify Event Bus publishes conversation events",
    run: async () => {
      await ensureBootstrapped();
      const eventBus = container.resolve<any>("IEventBus");
      
      let messageSentFired = false;
      let handoffFired = false;

      eventBus.subscribe("message.sent", async (envelope: any) => {
        messageSentFired = true;
      });

      eventBus.subscribe("conversation.handoff", async (envelope: any) => {
        handoffFired = true;
      });

      const tenantId = `tenant-${Date.now()}`;
      const leadId = `lead-${Date.now()}`;

      await prisma.lead.create({
        data: {
          id: leadId,
          businessId: tenantId,
          platform: "WHATSAPP",
          stage: "NEW"
        }
      } as any);

      // Trigger action which publishes message.sent
      await appendMessage(tenantId, leadId, { sender: "AI", content: "Automated message" });
      
      // Trigger escalation/handoff
      await handoffConversation(tenantId, leadId, "agent-1");

      await new Promise(resolve => setTimeout(resolve, 50));

      assert.ok(messageSentFired);
      assert.ok(handoffFired);

      restorePrismaMocks();
    }
  },
  {
    name: "Conversation Integration: verify conversation tools registered in ToolRegistry",
    run: async () => {
      await ensureBootstrapped();
      const toolRegistry = container.resolve<any>("IToolRegistry");
      
      const tools = toolRegistry.listTools().map((t: any) => t.name);
      assert.ok(tools.includes("retrieve_conversation"));
      assert.ok(tools.includes("append_message"));
      assert.ok(tools.includes("search_messages"));
      assert.ok(tools.includes("summarize_conversation"));
      assert.ok(tools.includes("update_summary"));
      assert.ok(tools.includes("attach_context"));
      assert.ok(tools.includes("retrieve_context"));
      assert.ok(tools.includes("generate_reply"));
      assert.ok(tools.includes("handoff_conversation"));
      assert.ok(tools.includes("close_conversation"));

      restorePrismaMocks();
    }
  },
  {
    name: "Conversation Integration: verify actor permission validations and isolation",
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

      await assert.rejects(
        async () => {
          await appendMessage(tenantA, "some-lead", { sender: "USER", content: "Hi" }, actorB);
        },
        /Cross-tenant conversation operation blocked/
      );

      restorePrismaMocks();
    }
  },
  {
    name: "Conversation Integration: verify Business Graph conversation link edges",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = `tenant-${Date.now()}`;
      const convId = "conv-123";
      const leadId = "lead-123";

      const memoryEngine = container.resolve<any>("IMemoryEngine");
      // Register nodes first
      await memoryEngine.upsertEntity({ id: `conversation:${convId}`, type: "conversation", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: `customer:${leadId}`, type: "customer", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "knowledge:kb-123", type: "knowledge", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "campaign:camp-123", type: "campaign", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "booking:bk-123", type: "booking", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "payment:pay-123", type: "payment", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "case:case-123", type: "case", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "decision:dec-123", type: "decision", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "timeline:tl-123", type: "timeline", properties: { tenantId } });

      // Link Conversation relations
      await linkConversationKnowledge(tenantId, convId, "kb-123");
      await linkConversationCrm(tenantId, convId, leadId);
      await linkConversationCampaign(tenantId, convId, "camp-123");
      await linkConversationBooking(tenantId, convId, "bk-123");
      await linkConversationPayment(tenantId, convId, "pay-123");
      await linkConversationSupportCase(tenantId, convId, "case-123");
      await linkConversationAIDecision(tenantId, convId, "dec-123");
      await linkConversationTimeline(tenantId, convId, "tl-123");

      const neighbors = await memoryEngine.queryNeighbors(`conversation:${convId}`);
      assert.ok(neighbors.length > 0);

      restorePrismaMocks();
    }
  },
  {
    name: "Conversation Integration: run validation check and return 100% adoption metrics",
    run: async () => {
      await ensureBootstrapped();
      const report = await validateConversationRuntimeAdoption();
      assert.equal(report.identityEngineAdoption, 100);
      assert.equal(report.memoryEngineAdoption, 100);
      assert.equal(report.contextRouterAdoption, 100);
      assert.equal(report.promptCompilerAdoption, 100);
      assert.equal(report.modelManagerAdoption, 100);
      assert.equal(report.eventBusAdoption, 100);
      assert.equal(report.toolRegistryAdoption, 100);
      assert.equal(report.permissionAdoption, 100);
      assert.equal(report.observabilityAdoption, 100);
      assert.equal(report.overallAdoption, 100);

      console.log("[Runtime Validation Success] Conversation Infrastructure Adoption is 100%!");
      console.log(JSON.stringify(report, null, 2));

      restorePrismaMocks();
    }
  }
];
