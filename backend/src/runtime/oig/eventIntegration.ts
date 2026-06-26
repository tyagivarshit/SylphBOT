import { IOrganizationIntelligenceGraph, OigSecurityContext } from "./interfaces";

export class OigEventIntegrator {
  private graph: IOrganizationIntelligenceGraph;
  private eventBus: any;
  private container: any;

  constructor(graph: IOrganizationIntelligenceGraph, eventBus: any, container?: any) {
    this.graph = graph;
    this.eventBus = eventBus;
    this.container = container;
  }

  public initialize(): void {
    // Dynamically register missing contracts for memory and identity integration if container is present
    if (this.container && this.container.has("IContractRegistry")) {
      try {
        const contractRegistry = this.container.resolve("IContractRegistry");
        
        contractRegistry.registerContract({
          name: "memory.fact.created",
          version: "1.0.0",
          schema: { leadId: "string", key: "string", value: "string", confidence: "number" }
        });

        contractRegistry.registerContract({
          name: "identity.profile.created",
          version: "1.0.0",
          schema: { actorId: "string", name: "string", role: "string" }
        });
      } catch (err) {
        // Contract might already be registered, safe to ignore
      }
    }

    // 1. CRM Runtime Events (using registered contract names)
    this.subscribeSafe("lead.created", (payload, ctx) => {
      const leadId = payload.leadId || payload.id;
      if (!leadId) return;
      this.graph.addSecureNode({
        id: leadId,
        type: "Entity",
        properties: { name: payload.name || "Unknown Lead", status: payload.status || "NEW", email: payload.email },
        tenantId: ctx.tenantId
      }, ctx);
    });

    this.subscribeSafe("lead.updated", (payload, ctx) => {
      const leadId = payload.leadId || payload.id;
      if (!leadId) return;
      this.graph.addSecureNode({
        id: leadId,
        type: "Entity",
        properties: { name: payload.name, status: payload.status, email: payload.email },
        tenantId: ctx.tenantId
      }, ctx);
    });

    // 2. Memory Engine Events (using dynamically registered contract name)
    this.subscribeSafe("memory.fact.created", (payload, ctx) => {
      const leadId = payload.leadId;
      const key = payload.key;
      const val = payload.value;
      if (!leadId || !key) return;

      const factNodeId = `fact_${leadId}_${key}`;
      // Add fact as Knowledge node
      this.graph.addSecureNode({
        id: factNodeId,
        type: "Knowledge",
        properties: { key, value: val, confidence: payload.confidence || 1.0 },
        tenantId: ctx.tenantId
      }, ctx);

      // Connect Lead to the Fact node
      this.graph.addSecureEdge({
        sourceId: leadId,
        targetId: factNodeId,
        predicate: "USES",
        properties: { key, confidence: payload.confidence || 1.0 },
        tenantId: ctx.tenantId
      }, ctx);
    });

    // 3. Workflow Runtime Events
    this.subscribeSafe("workflow.instance.created", (payload, ctx) => {
      const instanceId = payload.instanceId || payload.id;
      if (!instanceId) return;

      this.graph.addSecureNode({
        id: instanceId,
        type: "Workflow",
        properties: { definitionId: payload.definitionId, state: "Created" },
        tenantId: ctx.tenantId
      }, ctx);

      const targetId = payload.variables?.leadId || payload.variables?.businessId;
      if (targetId && this.graph.getNode(targetId)) {
        this.graph.addSecureEdge({
          sourceId: instanceId,
          targetId: targetId,
          predicate: "EXECUTED",
          properties: { timestamp: new Date() },
          tenantId: ctx.tenantId
        }, ctx);
      }
    });

    this.subscribeSafe("workflow.instance.completed", (payload, ctx) => {
      const instanceId = payload.instanceId || payload.id;
      if (!instanceId) return;

      this.graph.addSecureNode({
        id: instanceId,
        type: "Workflow",
        properties: { state: "Completed" },
        tenantId: ctx.tenantId
      }, ctx);
    });

    // 4. Financial Runtime Events
    this.subscribeSafe("financial.invoice.created", (payload, ctx) => {
      const invoiceId = payload.invoiceId || payload.id;
      if (!invoiceId) return;

      this.graph.addSecureNode({
        id: invoiceId,
        type: "Resource",
        properties: { category: "financial", amount: payload.amount, unit: payload.currency || "USD", state: "issued" },
        tenantId: ctx.tenantId
      }, ctx);

      const customerId = payload.customerId || payload.leadId;
      if (customerId && this.graph.getNode(customerId)) {
        this.graph.addSecureEdge({
          sourceId: customerId,
          targetId: invoiceId,
          predicate: "OWNS",
          properties: { amount: payload.amount },
          tenantId: ctx.tenantId
        }, ctx);
      }
    });

    this.subscribeSafe("financial.payment.charged", (payload, ctx) => {
      const paymentId = payload.paymentId || payload.id;
      if (!paymentId) return;

      this.graph.addSecureNode({
        id: paymentId,
        type: "Resource",
        properties: { category: "payment", amount: payload.amount, state: "charged" },
        tenantId: ctx.tenantId
      }, ctx);

      const invoiceId = payload.invoiceId;
      if (invoiceId && this.graph.getNode(invoiceId)) {
        this.graph.addSecureEdge({
          sourceId: paymentId,
          targetId: invoiceId,
          predicate: "ALLOCATED",
          properties: { amount: payload.amount },
          tenantId: ctx.tenantId
        }, ctx);
      }
    });

    // 5. Conversation Runtime Events (using registered contract names)
    this.subscribeSafe("conversation.started", (payload, ctx) => {
      const sessionId = payload.sessionId || payload.id || `session_${payload.leadId}`;
      if (!sessionId) return;

      this.graph.addSecureNode({
        id: sessionId,
        type: "Interaction",
        properties: { channel: payload.channel || "chat", state: "active" },
        tenantId: ctx.tenantId
      }, ctx);

      const participantId = payload.leadId;
      if (participantId && this.graph.getNode(participantId)) {
        this.graph.addSecureEdge({
          sourceId: participantId,
          targetId: sessionId,
          predicate: "PARTICIPATED_IN",
          properties: { startedAt: new Date() },
          tenantId: ctx.tenantId
        }, ctx);
      }
    });

    // 6. Scheduling Runtime Events (using registered contract names)
    this.subscribeSafe("booking.created", (payload, ctx) => {
      const bookingId = payload.bookingId || payload.id || `booking_${payload.leadId}`;
      if (!bookingId) return;

      this.graph.addSecureNode({
        id: bookingId,
        type: "Interaction",
        properties: { category: "booking", appointmentTime: payload.appointmentTime, status: "scheduled" },
        tenantId: ctx.tenantId
      }, ctx);

      const leadId = payload.leadId;
      if (leadId && this.graph.getNode(leadId)) {
        this.graph.addSecureEdge({
          sourceId: leadId,
          targetId: bookingId,
          predicate: "PARTICIPATED_IN",
          properties: {},
          tenantId: ctx.tenantId
        }, ctx);
      }
    });

    // 7. Knowledge Runtime Events
    this.subscribeSafe("knowledge.created", (payload, ctx) => {
      const knowledgeId = payload.knowledgeId || payload.id;
      if (!knowledgeId) return;

      this.graph.addSecureNode({
        id: knowledgeId,
        type: "Knowledge",
        properties: { title: payload.title, sourceType: payload.sourceType },
        tenantId: ctx.tenantId
      }, ctx);
    });

    // 8. Identity Engine Events (using dynamically registered contract name)
    this.subscribeSafe("identity.profile.created", (payload, ctx) => {
      const actorId = payload.actorId || payload.id;
      if (!actorId) return;

      this.graph.addSecureNode({
        id: actorId,
        type: "Organization",
        properties: { name: payload.name || "Actor Profile", role: payload.role },
        tenantId: ctx.tenantId
      }, ctx);
    });
  }

  private subscribeSafe(topic: string, handler: (payload: any, ctx: OigSecurityContext) => void | Promise<void>): void {
    this.eventBus.subscribe(topic, async (envelope: any) => {
      try {
        const payload = envelope.payload || envelope || {};
        const metadata = envelope.metadata || {};
        const tenantId = metadata.tenantId || payload.businessId || payload.tenantId || "default_tenant";
        const actorId = metadata.actorId || payload.actorId || "system_sync";
        const roles = metadata.roles || ["SERVICE"];
        const scopes = metadata.scopes || ["oig:sync", "oig:write", "oig:read"];

        const securityContext: OigSecurityContext = {
          tenantId,
          actorId,
          roles,
          scopes
        };

        await handler(payload, securityContext);
      } catch (err: any) {
        console.error(`[OIG Event Integration] Sync failure on topic [${topic}]:`, err);
        if (typeof (this.graph as any).incrementSyncFailure === "function") {
          (this.graph as any).incrementSyncFailure();
        }
      }
    });
  }
}
