import { IDomainPlugin } from "../interfaces/universal";
import { DIContainer } from "../kernel/diContainer";
import { Prisma } from "@prisma/client";

// ==========================================
// 1. KNOWLEDGE RUNTIME PLUGIN
// ==========================================
export class KnowledgeRuntimePlugin implements IDomainPlugin {
  public id = "plugin.knowledge";
  public name = "Knowledge Runtime Plugin";
  public version = "1.0.0";
  public supportedDomains = ["knowledge"];
  public capabilities = ["search_knowledge", "retrieve_knowledge", "import_knowledge", "update_knowledge", "delete_knowledge", "embed_knowledge", "index_knowledge"];

  public async onRegister(container: DIContainer): Promise<void> {
    const contractRegistry = container.resolve<any>("IContractRegistry");
    const toolRegistry = container.resolve<any>("IToolRegistry");
    const eventBus = container.resolve<any>("IEventBus");
    const learningRegistry = container.resolve<any>("ILearningRegistry");
    const memoryEngine = container.resolve<any>("IMemoryEngine");

    const knowledgeEventSchema = {
      knowledgeId: "string" as const,
      businessId: "string" as const,
      title: "string" as const,
      content: "string" as const,
      sourceType: "string" as const,
    };

    const deleteSchema = {
      knowledgeId: "string" as const,
      businessId: "string" as const,
    };

    contractRegistry.registerContract({ name: "knowledge.created", version: "1.0.0", schema: knowledgeEventSchema });
    contractRegistry.registerContract({ name: "knowledge.updated", version: "1.0.0", schema: {
      knowledgeId: "string" as const,
      businessId: "string" as const,
      title: "string" as const,
      content: "string" as const,
    }});
    contractRegistry.registerContract({ name: "knowledge.deleted", version: "1.0.0", schema: deleteSchema });
    contractRegistry.registerContract({ name: "knowledge.imported", version: "1.0.0", schema: knowledgeEventSchema });
    contractRegistry.registerContract({ name: "knowledge.embedded", version: "1.0.0", schema: deleteSchema });
    contractRegistry.registerContract({ name: "knowledge.indexed", version: "1.0.0", schema: deleteSchema });

    const publishToLearningRegistry = async (envelope: any) => {
      try {
        const payload = envelope.payload;
        const tenantId = envelope.metadata.tenantId || payload.businessId || "default_tenant";
        const title = payload.title || "Knowledge Base Action";
        const content = payload.content || "";
        
        const pattern = `knowledge keyword: ${title}`;
        const bestPractice = `Use the following verified knowledge: ${content}`;
        const fewShotExamples = [
          {
            input: `What is the policy or detail regarding ${title}?`,
            output: content,
          }
        ];

        const learning = await learningRegistry.registerLearning(
          tenantId,
          pattern,
          bestPractice,
          fewShotExamples,
          { accuracy: 1.0, feedbackScore: 5 }
        );

        await learningRegistry.approveLearning(learning.id, "SYSTEM_INTEGRATION_AGENT");
      } catch (err) {
        console.error("[Knowledge Learning Integration] Failed to process learning registry write:", err);
      }
    };

    eventBus.subscribe("knowledge.created", publishToLearningRegistry);
    eventBus.subscribe("knowledge.updated", publishToLearningRegistry);
    eventBus.subscribe("knowledge.imported", publishToLearningRegistry);

    toolRegistry.registerTool({
      name: "search_knowledge",
      description: "Search the database-backed Knowledge Base using structured and semantic criteria.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          query: { type: "string" },
          options: { type: "object" }
        },
        required: ["businessId", "query"]
      },
      execute: async (context: any, args: any) => {
        const { searchKnowledge } = await import("../../services/knowledgeSearch.service");
        return searchKnowledge(args.businessId, args.query, args.options);
      }
    });

    toolRegistry.registerTool({
      name: "retrieve_knowledge",
      description: "Retrieve a specific knowledge base record by its ID.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          id: { type: "string" }
        },
        required: ["businessId", "id"]
      },
      execute: async (context: any, args: any) => {
        return memoryEngine.readKnowledge(args.businessId, args.id);
      }
    });

    toolRegistry.registerTool({
      name: "import_knowledge",
      description: "Import or ingest new data/facts into the knowledge base.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          clientId: { type: "string" },
          input: { type: "string" },
          output: { type: "string" }
        },
        required: ["businessId", "input", "output"]
      },
      execute: async (context: any, args: any) => {
        const { ingestKnowledge } = await import("../../services/knowledgeIngestion.service");
        return ingestKnowledge({
          businessId: args.businessId,
          clientId: args.clientId,
          input: args.input,
          output: args.output
        });
      }
    });

    toolRegistry.registerTool({
      name: "update_knowledge",
      description: "Update the title, content, or active state of an existing knowledge base record.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          id: { type: "string" },
          data: { type: "object" }
        },
        required: ["businessId", "id", "data"]
      },
      execute: async (context: any, args: any) => {
        return memoryEngine.updateKnowledge(args.businessId, args.id, args.data);
      }
    });

    toolRegistry.registerTool({
      name: "delete_knowledge",
      description: "Deactivate or soft-delete a knowledge base record.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          id: { type: "string" }
        },
        required: ["businessId", "id"]
      },
      execute: async (context: any, args: any) => {
        return memoryEngine.deleteKnowledge(args.businessId, args.id);
      }
    });

    toolRegistry.registerTool({
      name: "embed_knowledge",
      description: "Generate vector embeddings for knowledge base content.",
      schema: {
        type: "object",
        properties: {
          text: { type: "string" }
        },
        required: ["text"]
      },
      execute: async (context: any, args: any) => {
        const { createEmbedding } = await import("../../services/embedding.service");
        return createEmbedding(args.text);
      }
    });

    toolRegistry.registerTool({
      name: "index_knowledge",
      description: "Compile and prepare knowledge base entries for optimized indexing and matching.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          id: { type: "string" },
          embedding: { type: "array", items: { type: "number" } }
        },
        required: ["businessId", "id", "embedding"]
      },
      execute: async (context: any, args: any) => {
        return memoryEngine.updateKnowledge(args.businessId, args.id, { embedding: args.embedding });
      }
    });
  }

  public async onUnregister(container: DIContainer): Promise<void> {}
}

// ==========================================
// 2. CRM RUNTIME PLUGIN
// ==========================================
export class CrmRuntimePlugin implements IDomainPlugin {
  public id = "plugin.crm";
  public name = "CRM Runtime Plugin";
  public version = "1.0.0";
  public supportedDomains = ["crm"];
  public capabilities = ["search_customer", "create_lead", "update_lead", "qualify_lead", "move_pipeline", "retrieve_customer", "merge_customer", "link_conversation", "attach_knowledge"];

  public async onRegister(container: DIContainer): Promise<void> {
    const contractRegistry = container.resolve<any>("IContractRegistry");
    const toolRegistry = container.resolve<any>("IToolRegistry");

    contractRegistry.registerContract({ name: "lead.created", version: "1.0.0", schema: { leadId: "string", businessId: "string", platform: "string", stage: "string" } });
    contractRegistry.registerContract({ name: "lead.updated", version: "1.0.0", schema: { leadId: "string", businessId: "string", stage: "string" } });
    contractRegistry.registerContract({ name: "lead.deleted", version: "1.0.0", schema: { leadId: "string", businessId: "string", reason: "string" } });
    contractRegistry.registerContract({ name: "customer.created", version: "1.0.0", schema: { customerId: "string", businessId: "string", unifiedId: "string" } });
    contractRegistry.registerContract({ name: "customer.updated", version: "1.0.0", schema: { customerId: "string", businessId: "string" } });
    contractRegistry.registerContract({ name: "customer.converted", version: "1.0.0", schema: { customerId: "string", businessId: "string", stage: "string" } });
    contractRegistry.registerContract({ name: "pipeline.stage.changed", version: "1.0.0", schema: { leadId: "string", businessId: "string", oldStage: "string", newStage: "string" } });
    contractRegistry.registerContract({ name: "deal.created", version: "1.0.0", schema: { dealId: "string", businessId: "string", amount: "number", title: "string" } });
    contractRegistry.registerContract({ name: "deal.won", version: "1.0.0", schema: { dealId: "string", businessId: "string" } });
    contractRegistry.registerContract({ name: "deal.lost", version: "1.0.0", schema: { dealId: "string", businessId: "string" } });
    contractRegistry.registerContract({ name: "contact.updated", version: "1.0.0", schema: { customerId: "string", businessId: "string", contactData: "object" } });

    toolRegistry.registerTool({
      name: "search_customer",
      description: "Search for customer leads based on text query.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          query: { type: "string" }
        },
        required: ["businessId", "query"]
      },
      execute: async (context: any, args: any) => {
        const { searchCustomer } = await import("../../services/crm/crmIntegration.service");
        return searchCustomer(args.businessId, args.query, context?.actor);
      }
    });

    toolRegistry.registerTool({
      name: "create_lead",
      description: "Create a new CRM lead with profile parameters.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          data: { type: "object" }
        },
        required: ["businessId", "data"]
      },
      execute: async (context: any, args: any) => {
        const { createLead } = await import("../../services/crm/crmIntegration.service");
        return createLead(args.businessId, args.data, context?.actor);
      }
    });

    toolRegistry.registerTool({
      name: "update_lead",
      description: "Update existing CRM lead records.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          leadId: { type: "string" },
          data: { type: "object" }
        },
        required: ["businessId", "leadId", "data"]
      },
      execute: async (context: any, args: any) => {
        const { updateLead } = await import("../../services/crm/crmIntegration.service");
        return updateLead(args.businessId, args.leadId, args.data, context?.actor);
      }
    });

    toolRegistry.registerTool({
      name: "qualify_lead",
      description: "Qualify a lead, transitioning it to a customer.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          leadId: { type: "string" }
        },
        required: ["businessId", "leadId"]
      },
      execute: async (context: any, args: any) => {
        const { qualifyLead } = await import("../../services/crm/crmIntegration.service");
        return qualifyLead(args.businessId, args.leadId, context?.actor);
      }
    });

    toolRegistry.registerTool({
      name: "move_pipeline",
      description: "Move lead stage to transition progress.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          leadId: { type: "string" },
          newStage: { type: "string" }
        },
        required: ["businessId", "leadId", "newStage"]
      },
      execute: async (context: any, args: any) => {
        const { movePipeline } = await import("../../services/crm/crmIntegration.service");
        return movePipeline(args.businessId, args.leadId, args.newStage, context?.actor);
      }
    });

    toolRegistry.registerTool({
      name: "retrieve_customer",
      description: "Retrieve a customer profile by ID.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          leadId: { type: "string" }
        },
        required: ["businessId", "leadId"]
      },
      execute: async (context: any, args: any) => {
        const { retrieveCustomer } = await import("../../services/crm/crmIntegration.service");
        return retrieveCustomer(args.businessId, args.leadId, context?.actor);
      }
    });

    toolRegistry.registerTool({
      name: "merge_customer",
      description: "Merge secondary duplicate lead into primary customer lead.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          primaryLeadId: { type: "string" },
          secondaryLeadId: { type: "string" }
        },
        required: ["businessId", "primaryLeadId", "secondaryLeadId"]
      },
      execute: async (context: any, args: any) => {
        const { mergeCustomer } = await import("../../services/crm/crmIntegration.service");
        return mergeCustomer(args.businessId, args.primaryLeadId, args.secondaryLeadId, context?.actor);
      }
    });

    toolRegistry.registerTool({
      name: "link_conversation",
      description: "Link conversation interactions with customer context.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          leadId: { type: "string" },
          conversationId: { type: "string" }
        },
        required: ["businessId", "leadId", "conversationId"]
      },
      execute: async (context: any, args: any) => {
        const { linkConversation } = await import("../../services/crm/crmIntegration.service");
        return linkConversation(args.businessId, args.leadId, args.conversationId, context?.actor);
      }
    });

    toolRegistry.registerTool({
      name: "attach_knowledge",
      description: "Attach knowledge context mappings to customers.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          leadId: { type: "string" },
          knowledgeId: { type: "string" }
        },
        required: ["businessId", "leadId", "knowledgeId"]
      },
      execute: async (context: any, args: any) => {
        const { attachKnowledge } = await import("../../services/crm/crmIntegration.service");
        return attachKnowledge(args.businessId, args.leadId, args.knowledgeId, context?.actor);
      }
    });
  }

  public async onUnregister(container: DIContainer): Promise<void> {}
}

// ==========================================
// 3. CONVERSATION RUNTIME PLUGIN
// ==========================================
export class ConversationRuntimePlugin implements IDomainPlugin {
  public id = "plugin.conversation";
  public name = "Conversation Runtime Plugin";
  public version = "1.0.0";
  public supportedDomains = ["conversation"];
  public capabilities = ["retrieve_conversation", "append_message", "search_messages", "summarize_conversation", "update_summary", "attach_context", "retrieve_context", "generate_reply", "handoff_conversation", "close_conversation"];

  public async onRegister(container: DIContainer): Promise<void> {
    const contractRegistry = container.resolve<any>("IContractRegistry");
    const toolRegistry = container.resolve<any>("IToolRegistry");
    const promptCompiler = container.resolve<any>("IPromptCompiler");

    promptCompiler.registerTemplate({
      id: "reply_generation",
      version: "1.0.0",
      systemTemplate: "You are a helpful customer assistant. Reply to user queries safely.\n\nContext:\n{{knowledge}}",
      userTemplate: "History:\n{{memory}}\n\nMessage: {{input}}",
      requiredPlaceholders: ["knowledge", "memory", "input"]
    });

    contractRegistry.registerContract({ name: "conversation.started", version: "1.0.0", schema: { leadId: "string", businessId: "string" } });
    contractRegistry.registerContract({ name: "conversation.resumed", version: "1.0.0", schema: { leadId: "string", businessId: "string" } });
    contractRegistry.registerContract({ name: "message.received", version: "1.0.0", schema: { leadId: "string", businessId: "string", sender: "string", content: "string" } });
    contractRegistry.registerContract({ name: "message.sent", version: "1.0.0", schema: { leadId: "string", businessId: "string", sender: "string", content: "string" } });
    contractRegistry.registerContract({ name: "conversation.paused", version: "1.0.0", schema: { leadId: "string", businessId: "string" } });
    contractRegistry.registerContract({ name: "conversation.closed", version: "1.0.0", schema: { leadId: "string", businessId: "string" } });
    contractRegistry.registerContract({ name: "conversation.escalated", version: "1.0.0", schema: { leadId: "string", businessId: "string" } });
    contractRegistry.registerContract({ name: "conversation.handoff", version: "1.0.0", schema: { leadId: "string", businessId: "string", targetAgentId: "string" } });
    contractRegistry.registerContract({ name: "conversation.summary.updated", version: "1.0.0", schema: { leadId: "string", businessId: "string", summary: "string" } });
    contractRegistry.registerContract({ name: "context.updated", version: "1.0.0", schema: { leadId: "string", businessId: "string", contextKey: "string", contextVal: "string" } });
    contractRegistry.registerContract({ name: "intent.changed", version: "1.0.0", schema: { leadId: "string", businessId: "string", newIntent: "string" } });
    contractRegistry.registerContract({ name: "sentiment.changed", version: "1.0.0", schema: { leadId: "string", businessId: "string", sentiment: "string" } });

    toolRegistry.registerTool({
      name: "retrieve_conversation",
      description: "Retrieve message history for a conversation.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          leadId: { type: "string" }
        },
        required: ["businessId", "leadId"]
      },
      execute: async (context: any, args: any) => {
        const { retrieveConversation } = await import("../../services/conversationIntegration.service");
        return retrieveConversation(args.businessId, args.leadId, context?.actor);
      }
    });

    toolRegistry.registerTool({
      name: "append_message",
      description: "Append a user or AI message to the timeline.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          leadId: { type: "string" },
          data: { type: "object" }
        },
        required: ["businessId", "leadId", "data"]
      },
      execute: async (context: any, args: any) => {
        const { appendMessage } = await import("../../services/conversationIntegration.service");
        return appendMessage(args.businessId, args.leadId, args.data, context?.actor);
      }
    });

    toolRegistry.registerTool({
      name: "search_messages",
      description: "Search messages by query string.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          leadId: { type: "string" },
          query: { type: "string" }
        },
        required: ["businessId", "leadId", "query"]
      },
      execute: async (context: any, args: any) => {
        const { searchMessages } = await import("../../services/conversationIntegration.service");
        return searchMessages(args.businessId, args.leadId, args.query, context?.actor);
      }
    });

    toolRegistry.registerTool({
      name: "summarize_conversation",
      description: "Generate and store conversation summary.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          leadId: { type: "string" }
        },
        required: ["businessId", "leadId"]
      },
      execute: async (context: any, args: any) => {
        const { summarizeConversation } = await import("../../services/conversationIntegration.service");
        return summarizeConversation(args.businessId, args.leadId, context?.actor);
      }
    });

    toolRegistry.registerTool({
      name: "update_summary",
      description: "Update the summary text explicitly.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          leadId: { type: "string" },
          summary: { type: "string" }
        },
        required: ["businessId", "leadId", "summary"]
      },
      execute: async (context: any, args: any) => {
        const { updateSummary } = await import("../../services/conversationIntegration.service");
        return updateSummary(args.businessId, args.leadId, args.summary, context?.actor);
      }
    });

    toolRegistry.registerTool({
      name: "attach_context",
      description: "Attach context items to conversation.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          leadId: { type: "string" },
          contextKey: { type: "string" },
          contextVal: { type: "string" }
        },
        required: ["businessId", "leadId", "contextKey", "contextVal"]
      },
      execute: async (context: any, args: any) => {
        const { attachContext } = await import("../../services/conversationIntegration.service");
        return attachContext(args.businessId, args.leadId, args.contextKey, args.contextVal, context?.actor);
      }
    });

    toolRegistry.registerTool({
      name: "retrieve_context",
      description: "Retrieve stored context value by key.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          leadId: { type: "string" },
          contextKey: { type: "string" }
        },
        required: ["businessId", "leadId", "contextKey"]
      },
      execute: async (context: any, args: any) => {
        const { retrieveContext } = await import("../../services/conversationIntegration.service");
        return retrieveContext(args.businessId, args.leadId, args.contextKey, context?.actor);
      }
    });

    toolRegistry.registerTool({
      name: "generate_reply",
      description: "Generate response reply using prompt compiler and model manager.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          leadId: { type: "string" },
          query: { type: "string" }
        },
        required: ["businessId", "leadId", "query"]
      },
      execute: async (context: any, args: any) => {
        const { generateReply } = await import("../../services/conversationIntegration.service");
        return generateReply(args.businessId, args.leadId, args.query, context?.actor);
      }
    });

    toolRegistry.registerTool({
      name: "handoff_conversation",
      description: "Escalate or handoff conversation to support agents.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          leadId: { type: "string" },
          targetAgentId: { type: "string" }
        },
        required: ["businessId", "leadId", "targetAgentId"]
      },
      execute: async (context: any, args: any) => {
        const { handoffConversation } = await import("../../services/conversationIntegration.service");
        return handoffConversation(args.businessId, args.leadId, args.targetAgentId, context?.actor);
      }
    });

    toolRegistry.registerTool({
      name: "close_conversation",
      description: "Close active conversation session.",
      schema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          leadId: { type: "string" }
        },
        required: ["businessId", "leadId"]
      },
      execute: async (context: any, args: any) => {
        const { closeConversation } = await import("../../services/conversationIntegration.service");
        return closeConversation(args.businessId, args.leadId, context?.actor);
      }
    });
  }

  public async onUnregister(container: DIContainer): Promise<void> {}
}

// ==========================================
// 4. GROWTH RUNTIME PLUGIN
// ==========================================
export class GrowthRuntimePlugin implements IDomainPlugin {
  public id = "plugin.growth";
  public name = "Growth Runtime Plugin";
  public version = "1.0.0";
  public supportedDomains = ["growth"];
  public capabilities = [
    "apply_growth_policy", "apply_growth_override", "create_growth_campaign", "execute_growth_campaign",
    "record_acquisition", "record_growth_conversion", "create_referral_code", "credit_referral_conversion",
    "onboard_growth_partner", "record_affiliate_commission", "settle_partner_payout", "advance_lifecycle_journey",
    "assess_churn_risk", "detect_expansion_opportunity", "launch_pricing_experiment", "rollback_pricing_experiment",
    "publish_offer", "publish_content_campaign", "request_review_reward", "record_channel_performance",
    "start_workflow", "pause_workflow", "resume_workflow", "cancel_workflow", "schedule_workflow",
    "retry_workflow", "execute_action", "queue_action", "send_email", "send_whatsapp", "send_instagram", "update_crm", "create_task"
  ];

  public async onRegister(container: DIContainer): Promise<void> {
    const contractRegistry = container.resolve<any>("IContractRegistry");
    const toolRegistry = container.resolve<any>("IToolRegistry");

    const growthEventSchema = { businessId: "string" as const };
    contractRegistry.registerContract({ name: "growth.acquisition.captured", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "growth.attribution.captured", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "growth.referral.rewarded", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "growth.referral.blocked", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "growth.affiliate.flagged", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "growth.partner.onboarded", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "growth.lifecycle.advanced", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "growth.churn.intervention", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "growth.expansion.detected", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "growth.pricing.experiment_launched", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "growth.pricing.rolled_back", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "growth.offer.published", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "growth.content.generated", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "growth.advocacy.rewarded", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "growth.channel.saturated", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "growth.override.applied", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "growth.execution.failed", version: "1.0.0", schema: growthEventSchema });

    // Workflow events
    contractRegistry.registerContract({ name: "conversation.updated", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "booking.created", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "payment.received", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "campaign.finished", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "workflow.started", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "workflow.completed", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "workflow.failed", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "workflow.cancelled", version: "1.0.0", schema: growthEventSchema });
    contractRegistry.registerContract({ name: "workflow.retry", version: "1.0.0", schema: growthEventSchema });

    const registerGrowthTool = (name: string, description: string, method: string) => {
      toolRegistry.registerTool({
        name,
        description,
        schema: {
          type: "object",
          properties: {
            businessId: { type: "string" },
            tenantId: { type: "string" }
          },
          required: ["businessId"]
        },
        execute: async (context: any, args: any) => {
          const service = await import("../../services/growthExpansionOS.service");
          const { validateGrowthExecution, executeGrowthWorkflowWithReliability } = await import("../../services/growthIntegration.service");
          const tenantId = args.tenantId || args.businessId || "default_tenant";
          await validateGrowthExecution(tenantId, name, args, context?.actor);
          return executeGrowthWorkflowWithReliability(tenantId, name, async () => {
            return (service as any)[method](args);
          });
        }
      });
    };

    registerGrowthTool("apply_growth_policy", "Apply growth policy to tenant", "applyGrowthPolicy");
    registerGrowthTool("apply_growth_override", "Apply growth override to campaign/tenant", "applyGrowthOverride");
    registerGrowthTool("create_growth_campaign", "Create a new growth campaign record", "createGrowthCampaign");
    registerGrowthTool("execute_growth_campaign", "Execute campaign dispatch or steps", "executeGrowthCampaign");
    registerGrowthTool("record_acquisition", "Record new customer acquisition channel data", "recordAcquisition");
    registerGrowthTool("record_growth_conversion", "Record conversion event for attribution", "recordGrowthConversion");
    registerGrowthTool("create_referral_code", "Generate referral code for referrer", "createReferralCode");
    registerGrowthTool("credit_referral_conversion", "Apply conversion reward for referral", "creditReferralConversion");
    registerGrowthTool("onboard_growth_partner", "Register affiliate partner details", "onboardGrowthPartner");
    registerGrowthTool("record_affiliate_commission", "Record commission for partner conversions", "recordAffiliateCommission");
    registerGrowthTool("settle_partner_payout", "Settle partner payout commission balance", "settlePartnerPayout");
    registerGrowthTool("advance_lifecycle_journey", "Advance customer lifecycle journey stage", "advanceLifecycleJourney");
    registerGrowthTool("assess_churn_risk", "Assess churn risk score and save action", "assessChurnRiskAndIntervene");
    registerGrowthTool("detect_expansion_opportunity", "Detect seat or brand expansion opportunity", "detectExpansionOpportunity");
    registerGrowthTool("launch_pricing_experiment", "Launch a pricing experiment arm", "launchPricingExperiment");
    registerGrowthTool("rollback_pricing_experiment", "Rollback pricing experiment to control", "rollbackPricingExperiment");
    registerGrowthTool("publish_offer", "Publish time-limited offer discounts", "publishOffer");
    registerGrowthTool("publish_content_campaign", "Publish whatsapp or email campaigns", "publishContentCampaign");
    registerGrowthTool("request_review_reward", "Request review action and queue reward", "requestReviewReward");
    registerGrowthTool("record_channel_performance", "Update channel performance saturation metrics", "recordChannelPerformance");

    const registerWorkflowTool = (name: string, description: string, executor: (args: any) => Promise<any>, successEvent?: string) => {
      toolRegistry.registerTool({
        name,
        description,
        schema: {
          type: "object",
          properties: {
            businessId: { type: "string" },
            tenantId: { type: "string" },
            flowId: { type: "string" },
            leadId: { type: "string" },
            executionId: { type: "string" },
            action: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            message: { type: "string" }
          },
          required: ["businessId"]
        },
        execute: async (context: any, args: any) => {
          const { validateGrowthExecution, executeGrowthWorkflowWithReliability, publishGrowthEvent } = await import("../../services/growthIntegration.service");
          const tenantId = args.tenantId || args.businessId || "default_tenant";
          await validateGrowthExecution(tenantId, name, args, context?.actor);
          return executeGrowthWorkflowWithReliability(tenantId, name, async () => {
            const result = await executor(args);
            if (successEvent) {
              await publishGrowthEvent(tenantId, successEvent, {
                businessId: tenantId,
                tenantId,
                ...args,
                result: typeof result === "string" ? result : JSON.stringify(result)
              });
            }
            return result;
          });
        }
      });
    };

    registerWorkflowTool("start_workflow", "Start a new workflow execution flow", async (args) => {
      const pm = (await import("../../config/prisma")).default;
      return pm.automationExecution.create({ data: { flowId: args.flowId || "flow-1", leadId: args.leadId || "lead-1", status: "ACTIVE", currentStep: "step-1" } });
    }, "workflow.started");

    registerWorkflowTool("pause_workflow", "Pause a running workflow execution flow", async (args) => {
      const pm = (await import("../../config/prisma")).default;
      return pm.automationExecution.updateMany({ where: { flowId: args.flowId, leadId: args.leadId }, data: { status: "PAUSED" } });
    }, "workflow.completed");

    registerWorkflowTool("resume_workflow", "Resume a paused workflow execution flow", async (args) => {
      const pm = (await import("../../config/prisma")).default;
      return pm.automationExecution.updateMany({ where: { flowId: args.flowId, leadId: args.leadId }, data: { status: "ACTIVE" } });
    }, "workflow.started");

    registerWorkflowTool("cancel_workflow", "Cancel a workflow execution flow", async (args) => {
      const pm = (await import("../../config/prisma")).default;
      return pm.automationExecution.updateMany({ where: { flowId: args.flowId, leadId: args.leadId }, data: { status: "CANCELLED" } });
    }, "workflow.cancelled");

    registerWorkflowTool("schedule_workflow", "Schedule workflow for execution", async (args) => {
      const pm = (await import("../../config/prisma")).default;
      return pm.automationExecution.create({ data: { flowId: args.flowId || "flow-1", leadId: args.leadId || "lead-1", status: "ACTIVE", currentStep: "scheduled" } });
    }, "workflow.started");

    registerWorkflowTool("retry_workflow", "Retry a failed workflow execution flow", async (args) => {
      const pm = (await import("../../config/prisma")).default;
      return pm.automationExecution.updateMany({ where: { id: args.executionId }, data: { status: "ACTIVE" } });
    }, "workflow.retry");

    registerWorkflowTool("execute_action", "Execute automation actions", async (args) => {
      return { status: "executed", action: args.action };
    }, "workflow.completed");

    registerWorkflowTool("queue_action", "Queue automation actions", async (args) => {
      return { status: "queued", action: args.action };
    }, "workflow.completed");

    registerWorkflowTool("send_email", "Send an outbound email workflow", async (args) => {
      const pm = (await import("../../config/prisma")).default;
      return pm.message.create({ data: { businessId: args.businessId, leadId: args.leadId || "lead-1", sender: "AI", content: `Email: ${args.message || "Hello"}` } });
    }, "campaign.finished");

    registerWorkflowTool("send_whatsapp", "Send a whatsapp message workflow", async (args) => {
      const pm = (await import("../../config/prisma")).default;
      return pm.message.create({ data: { businessId: args.businessId, leadId: args.leadId || "lead-1", sender: "AI", content: `WhatsApp: ${args.message || "Hello"}` } });
    }, "campaign.finished");

    registerWorkflowTool("send_instagram", "Send an instagram DM message workflow", async (args) => {
      const pm = (await import("../../config/prisma")).default;
      return pm.message.create({ data: { businessId: args.businessId, leadId: args.leadId || "lead-1", sender: "AI", content: `Instagram: ${args.message || "Hello"}` } });
    }, "campaign.finished");

    registerWorkflowTool("update_crm", "Update CRM record status", async (args) => {
      const pm = (await import("../../config/prisma")).default;
      return pm.lead.update({ where: { id: args.leadId || "lead-1" }, data: { stage: "QUALIFIED" } });
    }, "conversation.updated");

    registerWorkflowTool("create_task", "Create administrative follow-up task", async (args) => {
      return { taskCreated: true };
    }, "workflow.completed");
  }

  public async onUnregister(container: DIContainer): Promise<void> {}
}

// ==========================================
// 5. SCHEDULING RUNTIME PLUGIN
// ==========================================
export class SchedulingRuntimePlugin implements IDomainPlugin {
  public id = "plugin.scheduling";
  public name = "Scheduling Runtime Plugin";
  public version = "1.0.0";
  public supportedDomains = ["scheduling"];
  public capabilities = ["create_booking", "cancel_booking", "reschedule_booking", "confirm_booking", "retrieve_booking", "search_availability", "sync_calendar", "send_reminder", "generate_slots", "block_time", "unblock_time"];

  public async onRegister(container: DIContainer): Promise<void> {
    const contractRegistry = container.resolve<any>("IContractRegistry");
    const toolRegistry = container.resolve<any>("IToolRegistry");

    const schedulingEventSchema = { businessId: "string" as const };
    contractRegistry.registerContract({ name: "booking.created", version: "1.0.0", schema: schedulingEventSchema });
    contractRegistry.registerContract({ name: "booking.updated", version: "1.0.0", schema: schedulingEventSchema });
    contractRegistry.registerContract({ name: "booking.confirmed", version: "1.0.0", schema: schedulingEventSchema });
    contractRegistry.registerContract({ name: "booking.cancelled", version: "1.0.0", schema: schedulingEventSchema });
    contractRegistry.registerContract({ name: "booking.completed", version: "1.0.0", schema: schedulingEventSchema });
    contractRegistry.registerContract({ name: "booking.rescheduled", version: "1.0.0", schema: schedulingEventSchema });
    contractRegistry.registerContract({ name: "booking.reminder.sent", version: "1.0.0", schema: schedulingEventSchema });
    contractRegistry.registerContract({ name: "calendar.synced", version: "1.0.0", schema: schedulingEventSchema });
    contractRegistry.registerContract({ name: "availability.updated", version: "1.0.0", schema: schedulingEventSchema });
    contractRegistry.registerContract({ name: "meeting.started", version: "1.0.0", schema: schedulingEventSchema });
    contractRegistry.registerContract({ name: "meeting.finished", version: "1.0.0", schema: schedulingEventSchema });

    const registerSchedulingTool = (name: string, description: string, executor: (args: any) => Promise<any>, successEvent?: string) => {
      toolRegistry.registerTool({
        name,
        description,
        schema: {
          type: "object",
          properties: {
            businessId: { type: "string" },
            tenantId: { type: "string" },
            leadId: { type: "string" },
            appointmentKey: { type: "string" },
            slotId: { type: "string" },
            durationMinutes: { type: "number" },
            timezone: { type: "string" }
          },
          required: ["businessId"]
        },
        execute: async (context: any, args: any) => {
          const { validateSchedulingExecution, executeSchedulingWorkflowWithReliability, publishSchedulingEvent } = await import("../../services/schedulingIntegration.service");
          const tenantId = args.tenantId || args.businessId || "default_tenant";
          await validateSchedulingExecution(tenantId, name, args, context?.actor);
          return executeSchedulingWorkflowWithReliability(tenantId, name, async () => {
            const start = Date.now();
            const result = await executor(args);
            let metricName: any = "booking_latency";
            if (name === "search_availability" || name === "generate_slots") {
              metricName = "availability_latency";
            } else if (name === "send_reminder") {
              metricName = "reminder_latency";
            } else if (name === "sync_calendar") {
              metricName = "calendar_sync_latency";
            }
            const metrics = container.has("IMetricsEngine") ? container.resolve<any>("IMetricsEngine") : null;
            if (metrics) {
              metrics.recordSchedulingMetric(metricName, Date.now() - start);
              if (name === "create_booking") {
                metrics.recordSchedulingMetric("booking", 1);
              } else if (name === "cancel_booking") {
                metrics.recordSchedulingMetric("cancellation", 1);
              } else if (name === "reschedule_booking") {
                metrics.recordSchedulingMetric("reschedule", 1);
              } else if (name === "confirm_booking") {
                metrics.recordSchedulingMetric("completion", 1);
              }
            }
            if (successEvent) {
              await publishSchedulingEvent(tenantId, successEvent, {
                businessId: tenantId,
                tenantId,
                ...args,
                result: typeof result === "string" ? result : JSON.stringify(result)
              });
            }
            return result;
          });
        }
      });
    };

    registerSchedulingTool("create_booking", "Create a new booking/appointment", async (args) => {
      const { appointmentEngineService } = await import("../../services/appointmentEngine.service");
      return appointmentEngineService.requestAppointment({
        businessId: args.businessId,
        leadId: args.leadId || "lead-default",
        timezone: args.timezone || "UTC",
        durationMinutes: args.durationMinutes || 30
      });
    }, "booking.created");

    registerSchedulingTool("cancel_booking", "Cancel an active booking/appointment", async (args) => {
      const { appointmentEngineService } = await import("../../services/appointmentEngine.service");
      return appointmentEngineService.cancelAppointment({
        businessId: args.businessId,
        appointmentKey: args.appointmentKey || "key-default",
        reason: args.reason || "Client cancellation requested",
        actor: args.actor || "SELF"
      });
    }, "booking.cancelled");

    registerSchedulingTool("reschedule_booking", "Reschedule a booking/appointment", async (args) => {
      const { appointmentEngineService } = await import("../../services/appointmentEngine.service");
      return appointmentEngineService.requestAppointment({
        businessId: args.businessId,
        leadId: args.leadId || "lead-default",
        timezone: args.timezone || "UTC",
        durationMinutes: args.durationMinutes || 30,
        appointmentKey: args.appointmentKey
      });
    }, "booking.rescheduled");

    registerSchedulingTool("confirm_booking", "Confirm an appointment slot hold", async (args) => {
      const { appointmentEngineService } = await import("../../services/appointmentEngine.service");
      return appointmentEngineService.confirmSlot({
        businessId: args.businessId,
        appointmentKey: args.appointmentKey || "key-default"
      });
    }, "booking.confirmed");

    registerSchedulingTool("retrieve_booking", "Retrieve booking information for a lead", async (args) => {
      const { appointmentEngineService } = await import("../../services/appointmentEngine.service");
      return appointmentEngineService.getActiveAppointmentByLead({
        businessId: args.businessId,
        leadId: args.leadId || "lead-default"
      });
    });

    registerSchedulingTool("search_availability", "Check resource slot availability", async (args) => {
      const { appointmentEngineService } = await import("../../services/appointmentEngine.service");
      return appointmentEngineService.checkAvailability({
        businessId: args.businessId,
        appointmentKey: args.appointmentKey || "key-default",
        windowStart: args.windowStart ? new Date(args.windowStart) : new Date(),
        windowEnd: args.windowEnd ? new Date(args.windowEnd) : new Date(Date.now() + 30 * 24 * 3600 * 1000),
        preferredHumanId: args.preferredHumanId,
        preferredTeamId: args.preferredTeamId,
        urgency: args.urgency || "MEDIUM",
        isVip: args.isVip || false,
        maxResults: args.maxResults || 8
      });
    }, "availability.updated");

    registerSchedulingTool("sync_calendar", "Sync external provider calendars", async (args) => {
      return { synced: true };
    }, "calendar.synced");

    registerSchedulingTool("send_reminder", "Send meeting/booking automated reminders", async (args) => {
      const { appointmentEngineService } = await import("../../services/appointmentEngine.service");
      await appointmentEngineService.markReminderSent({
        businessId: args.businessId,
        appointmentKey: args.appointmentKey || "key-default",
        reminderType: args.reminderType || "general",
        channel: args.channel || "email"
      });
      return { reminderSent: true };
    }, "booking.reminder.sent");

    registerSchedulingTool("generate_slots", "Generate availability calendar slots", async (args) => {
      const { appointmentEngineService } = await import("../../services/appointmentEngine.service");
      return appointmentEngineService.checkAvailability({
        businessId: args.businessId,
        appointmentKey: args.appointmentKey || "key-default",
        windowStart: args.windowStart ? new Date(args.windowStart) : new Date(),
        windowEnd: args.windowEnd ? new Date(args.windowEnd) : new Date(Date.now() + 30 * 24 * 3600 * 1000),
        preferredHumanId: args.preferredHumanId,
        preferredTeamId: args.preferredTeamId,
        urgency: args.urgency || "MEDIUM",
        isVip: args.isVip || false,
        maxResults: args.maxResults || 8
      });
    }, "availability.updated");

    registerSchedulingTool("block_time", "Block calendar timeframe manually", async (args) => {
      const pm = (await import("../../config/prisma")).default;
      return pm.manualCalendarOverride.create({
        data: {
          businessId: args.businessId,
          provider: args.provider || "ALL",
          windowStart: args.windowStart ? new Date(args.windowStart) : new Date(),
          windowEnd: args.windowEnd ? new Date(args.windowEnd) : new Date(Date.now() + 3600 * 1000),
          reason: args.reason || "Manual block",
          expiresAt: args.expiresAt ? new Date(args.expiresAt) : new Date(Date.now() + 30 * 24 * 3600 * 1000),
          priority: args.priority || 100,
          isActive: true
        }
      });
    });

    registerSchedulingTool("unblock_time", "Unblock manually blocked calendar timeframe", async (args) => {
      const pm = (await import("../../config/prisma")).default;
      await pm.manualCalendarOverride.deleteMany({
        where: {
          businessId: args.businessId
        }
      });
      return { unblocked: true };
    });
  }

  public async onUnregister(container: DIContainer): Promise<void> {}
}

// ==========================================
// 6. FINANCE RUNTIME PLUGIN
// ==========================================
export class FinanceRuntimePlugin implements IDomainPlugin {
  public id = "plugin.finance";
  public name = "Finance Runtime Plugin";
  public version = "1.0.0";
  public supportedDomains = ["finance"];
  public capabilities = ["create_invoice", "charge_payment", "record_revenue", "record_expense", "create_budget", "link_financial_entity"];

  public async onRegister(container: DIContainer): Promise<void> {
    const contractRegistry = container.resolve<any>("IContractRegistry");
    const toolRegistry = container.resolve<any>("IToolRegistry");

    const financialSchema = {
      businessId: "string" as const,
      amount: "number" as const,
      currency: "string" as const
    };
    const financialSimpleSchema = {
      businessId: "string" as const
    };

    contractRegistry.registerContract({ name: "financial.invoice.created", version: "1.0.0", schema: financialSchema });
    contractRegistry.registerContract({ name: "financial.invoice.updated", version: "1.0.0", schema: financialSimpleSchema });
    contractRegistry.registerContract({ name: "financial.payment.charged", version: "1.0.0", schema: financialSchema });
    contractRegistry.registerContract({ name: "financial.payment.refunded", version: "1.0.0", schema: financialSchema });
    contractRegistry.registerContract({ name: "financial.revenue.recorded", version: "1.0.0", schema: financialSchema });
    contractRegistry.registerContract({ name: "financial.expense.recorded", version: "1.0.0", schema: financialSchema });
    contractRegistry.registerContract({ name: "financial.budget.created", version: "1.0.0", schema: financialSchema });
    contractRegistry.registerContract({ name: "financial.entity.linked", version: "1.0.0", schema: financialSimpleSchema });

    const registerFinancialTool = (
      name: string,
      description: string,
      executor: (args: any, context?: any) => Promise<any>,
      successEvent?: string
    ) => {
      toolRegistry.registerTool({
        name,
        description,
        schema: {
          type: "object",
          properties: {
            businessId: { type: "string" },
            tenantId: { type: "string" },
            amount: { type: "number" },
            currency: { type: "string" },
            entityId: { type: "string" },
            sourceId: { type: "string" },
            targetId: { type: "string" },
            predicate: { type: "string" }
          },
          required: ["businessId"]
        },
        execute: async (context: any, args: any) => {
          const { validateFinancialExecution, executeFinancialWorkflowWithReliability, publishFinancialEvent } = await import("../../services/financialIntegration.service");
          const tenantId = args.tenantId || args.businessId || "default_tenant";
          await validateFinancialExecution(tenantId, name, args, context?.actor);
          return executeFinancialWorkflowWithReliability(tenantId, name, async () => {
            const start = Date.now();
            const result = await executor(args, context);
            
            let metricName: any = null;
            if (name.includes("invoice")) {
              metricName = "invoice_latency";
            } else if (name.includes("refund")) {
              metricName = "refund_latency";
            } else if (name.includes("revenue")) {
              metricName = "revenue_latency";
            } else if (name.includes("expense")) {
              metricName = "expense_latency";
            }
            
            if (metricName) {
              const metrics = container.has("IMetricsEngine") ? container.resolve<any>("IMetricsEngine") : null;
              if (metrics) {
                metrics.recordSchedulingMetric(metricName, Date.now() - start);
              }
            }

            if (successEvent) {
              await publishFinancialEvent(tenantId, successEvent, {
                businessId: tenantId,
                tenantId,
                amount: args.amount || 0,
                currency: args.currency || "USD",
                ...args,
                result: typeof result === "string" ? result : JSON.stringify(result)
              });
            }
            return result;
          });
        }
      });
    };

    registerFinancialTool("create_invoice", "Create a new invoice event", async (args) => {
      const { recordFinancialEvent } = await import("../../services/financialIntegration.service");
      const event = recordFinancialEvent({
        tenantId: args.businessId,
        eventType: "financial.invoice.created",
        amount: args.amount || 0,
        currency: args.currency || "USD",
        entityId: args.entityId || "invoice-1",
        metadata: { ...args }
      });
      return { status: "created", eventId: event.id };
    }, "financial.invoice.created");

    registerFinancialTool("charge_payment", "Process a charge/payment event", async (args) => {
      const { recordFinancialEvent } = await import("../../services/financialIntegration.service");
      const event = recordFinancialEvent({
        tenantId: args.businessId,
        eventType: "financial.payment.charged",
        amount: args.amount || 0,
        currency: args.currency || "USD",
        entityId: args.entityId || "payment-1",
        metadata: { ...args }
      });
      return { status: "succeeded", eventId: event.id };
    }, "financial.payment.charged");

    registerFinancialTool("record_revenue", "Record incoming revenue event", async (args) => {
      const { recordFinancialEvent } = await import("../../services/financialIntegration.service");
      const event = recordFinancialEvent({
        tenantId: args.businessId,
        eventType: "financial.revenue.recorded",
        amount: args.amount || 0,
        currency: args.currency || "USD",
        entityId: args.entityId || "rev-1",
        metadata: { ...args }
      });
      return { status: "recorded", eventId: event.id };
    }, "financial.revenue.recorded");

    registerFinancialTool("record_expense", "Record expense event", async (args) => {
      const { recordFinancialEvent } = await import("../../services/financialIntegration.service");
      const event = recordFinancialEvent({
        tenantId: args.businessId,
        eventType: "financial.expense.recorded",
        amount: args.amount || 0,
        currency: args.currency || "USD",
        entityId: args.entityId || "exp-1",
        metadata: { ...args }
      });
      return { status: "recorded", eventId: event.id };
    }, "financial.expense.recorded");

    registerFinancialTool("create_budget", "Create financial budget guidelines", async (args) => {
      const { recordFinancialEvent } = await import("../../services/financialIntegration.service");
      const event = recordFinancialEvent({
        tenantId: args.businessId,
        eventType: "financial.budget.created",
        amount: args.amount || 0,
        currency: args.currency || "USD",
        entityId: args.entityId || "budget-1",
        metadata: { ...args }
      });
      return { status: "created", eventId: event.id };
    }, "financial.budget.created");

    registerFinancialTool("link_financial_entity", "Link financial entities in business graph", async (args) => {
      const { linkFinancialEntity } = await import("../../services/financialIntegration.service");
      await linkFinancialEntity(
        args.businessId,
        args.sourceId,
        args.targetId,
        args.predicate || "LINKED_TO"
      );
      return { status: "linked" };
    }, "financial.entity.linked");
  }

  public async onUnregister(container: DIContainer): Promise<void> {}
}
