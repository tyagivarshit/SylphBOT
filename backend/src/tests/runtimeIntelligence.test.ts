import assert from "node:assert/strict";
import { DIContainer } from "../runtime/kernel/diContainer";
import {
  ContextBudgetManager,
  ContextIntelligenceEngine,
  MemoryEngine,
  MemorySelectionEngine,
  KnowledgeSelectionEngine,
  LearningRegistry,
  ConstitutionIntegrationLayer,
  PromptCompiler,
  ReasoningFramework,
  MemoryRecord,
  KnowledgeItem,
  ContextItem
} from "../runtime/intelligence";

export const runtimeIntelligenceTests: any[] = [
  {
    name: "Context Budget Manager: allocates and prevents overflow by scaling down",
    run: () => {
      const budgetManager = new ContextBudgetManager(1000);
      const budget = budgetManager.getBudget();

      // Check default allocations
      assert.equal(budget.maxTokens, 1000);
      assert.equal(budget.allocations.constitution, 150);
      assert.equal(budget.allocations.memory, 250);
      
      // Check token estimation
      assert.equal(budgetManager.estimateTokens("abcd"), 1);
      assert.equal(budgetManager.estimateTokens("abcdefgh"), 2);

      // Check overflow resolver
      const excessAllocations = {
        a: 600,
        b: 600
      };
      const resolved = budgetManager.resolveOverflow(excessAllocations, 1000);
      assert.equal(resolved.a, 500);
      assert.equal(resolved.b, 500);
    }
  },
  {
    name: "Context Intelligence Engine: scores, ranks, compresses and assembles context items within budget",
    run: () => {
      const budgetManager = new ContextBudgetManager(200);
      const engine = new ContextIntelligenceEngine(budgetManager);

      // Score relevance
      const score = engine.scoreRelevance("Executive billing report of Sylph", "billing");
      assert.ok(score > 0);

      // Rank context items
      const items: ContextItem[] = [
        {
          id: "1",
          source: "memory",
          content: "low relevance detail",
          priority: 5,
          relevanceScore: 0.1,
          tokenLength: 50
        },
        {
          id: "2",
          source: "knowledge",
          content: "highly relevant knowledge info",
          priority: 1,
          relevanceScore: 0.9,
          tokenLength: 50
        }
      ];

      const ranked = engine.rankContext(items);
      assert.equal(ranked[0].id, "2");

      // Compresses content
      const longText = "line one\nline two\nline three\nline four\nline five";
      const compressedText = engine.compressContext(longText, 10);
      assert.ok(compressedText.includes("[Compressed]"));

      // Assembles context items within budget limit
      const assembled = engine.assembleContext(items, 60);
      assert.equal(assembled.length, 1);
      assert.equal(assembled[0].id, "2");
    }
  },
  {
    name: "Memory Engine: writes versioned records, respects access rules and performs retention cleanup",
    run: async () => {
      const memory = new MemoryEngine();
      
      // Multi-tenant isolation test
      const recA = await memory.writeMemory("tenant-1", "business", "key1", "val1", 0.9, ["admin"]);
      const recB = await memory.writeMemory("tenant-2", "business", "key1", "val2", 0.9, ["admin"]);
      
      assert.equal(recA.version, 1);
      assert.equal(recB.version, 1);

      // Versioning test
      const recA2 = await memory.writeMemory("tenant-1", "business", "key1", "updated-val1", 0.95, ["admin"]);
      assert.equal(recA2.version, 2);
      
      const history = await memory.getMemoryHistory("tenant-1", "business", "key1");
      assert.equal(history.length, 2);
      assert.equal(history[0].value, "val1");
      assert.equal(history[1].value, "updated-val1");

      // Access rules verification
      const record = await memory.readMemory("tenant-1", "business", "key1", ["admin"]);
      assert.ok(record);
      assert.equal(record.value, "updated-val1");

      await assert.rejects(async () => {
        await memory.readMemory("tenant-1", "business", "key1", ["guest"]);
      }, /Access denied/);

      // Retention cleanup
      const deletedCount = await memory.applyRetentionPolicy("tenant-1", new Date(), 0.92);
      assert.equal(deletedCount, 1); // removes key1 v1 because confidence is 0.9 (< 0.92)

      // Search memory
      const searchRes = await memory.searchMemory("tenant-2", "business", "val2", ["admin"]);
      assert.equal(searchRes.length, 1);
      assert.equal(searchRes[0].value, "val2");
    }
  },
  {
    name: "Memory Engine: timeline and graph capabilities function correctly",
    run: async () => {
      const memory = new MemoryEngine();

      // Timeline Memory
      const msg1 = await memory.appendMessage("lead_1", { sender: "USER", content: "hello" });
      const msg2 = await memory.appendMessage("lead_1", { sender: "AI", content: "hi" });
      assert.equal(msg1.sender, "USER");
      assert.equal(msg2.sender, "AI");

      const recent = await memory.getRecentMessages("lead_1", 10);
      assert.equal(recent.length, 2);

      await memory.clearTimeline("lead_1");
      const emptyRecent = await memory.getRecentMessages("lead_1", 10);
      assert.equal(emptyRecent.length, 0);

      // Future Graph Memory
      await memory.upsertEntity({
        id: "node_1",
        type: "entity",
        name: "Sylph Core",
        properties: { tenantId: "tenant-1" }
      });
      await memory.upsertEntity({
        id: "node_2",
        type: "entity",
        name: "Sylph Intelligence",
        properties: { tenantId: "tenant-1" }
      });
      await memory.linkEntities({
        sourceId: "node_1",
        targetId: "node_2",
        predicate: "contains",
        tenantId: "tenant-1"
      });

      const neighbors = await memory.queryNeighbors("node_1");
      assert.equal(neighbors.length, 1);
      assert.equal(neighbors[0].name, "Sylph Intelligence");
    }
  },
  {
    name: "Memory Selection Engine: ranks memories using semantic, temporal decay, and budget constraints",
    run: async () => {
      const dummyContainer = new DIContainer();
      const selector = new MemorySelectionEngine(dummyContainer, 0.1);

      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);

      const memories: MemoryRecord[] = [
        {
          id: "m1",
          tenantId: "t1",
          type: "customer",
          key: "topic_billing",
          value: "invoice issues",
          confidence: 0.9,
          version: 1,
          createdAt: yesterday,
          lastObservedAt: yesterday,
          metadata: { priority: 9 } // low priority
        },
        {
          id: "m2",
          tenantId: "t1",
          type: "customer",
          key: "topic_billing",
          value: "payment methods",
          confidence: 0.95,
          version: 1,
          createdAt: now,
          lastObservedAt: now,
          metadata: { priority: 1 } // high priority
        }
      ];

      const selected = await selector.selectMemories(memories, "payment methods", 100);
      assert.equal(selected.length, 2);
      assert.equal(selected[0].id, "m2"); // should be m2 since it is newer, higher priority, and matches query semantically
    }
  },
  {
    name: "Knowledge Selection Engine: filters, ranks and budgets knowledge items",
    run: async () => {
      const dummyContainer = new DIContainer();
      const selection = new KnowledgeSelectionEngine(dummyContainer);

      const items: KnowledgeItem[] = [
        {
          id: "k1",
          tenantId: "t1",
          category: "pricing",
          tags: ["tier1"],
          content: "Sylph tier 1 pricing details",
          confidence: 0.9,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: "k2",
          tenantId: "t1",
          category: "pricing",
          tags: ["tier2"],
          content: "Sylph tier 2 pricing information details",
          confidence: 0.5, // low confidence
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      // Filter by confidence and select
      const selected = await selection.selectKnowledge(items, "pricing", 100, { minConfidence: 0.8 });
      assert.equal(selected.length, 1);
      assert.equal(selected[0].id, "k1");
    }
  },
  {
    name: "Learning Registry: registers optimizations, manages validated learnings, and supports optimization variants",
    run: async () => {
      const registry = new LearningRegistry();

      // Optimization metrics variant selection compatibility
      await registry.registerOptimization({
        businessId: "b1",
        promptTemplateId: "t1",
        variantKey: "v1",
        conversionMetrics: { clicks: 10, responses: 5, revenue: 100 }
      });
      await registry.registerOptimization({
        businessId: "b1",
        promptTemplateId: "t1",
        variantKey: "v2",
        conversionMetrics: { clicks: 20, responses: 15, revenue: 500 }
      });

      const best = await registry.getOptimizedVariant("b1", "t1");
      assert.equal(best, "v2"); // v2 has higher click and response and revenue metrics

      // Learning Registry approval flow
      const entry = await registry.registerLearning(
        "b1",
        "billing patterns",
        "Always request currency check.",
        [{ input: "how much", output: "currency check first" }]
      );
      assert.equal(entry.status, "pending");

      // Validator check
      await registry.approveLearning(entry.id, "validator_99");
      const approved = await registry.getApprovedLearnings("b1");
      assert.equal(approved.length, 1);
      assert.equal(approved[0].status, "approved");
      assert.equal(approved[0].validatorId, "validator_99");

      // Extract patterns
      const bestPractices = await registry.getBestPractices("b1");
      assert.equal(bestPractices[0], "Always request currency check.");

      const fewShots = await registry.getFewShots("b1", "billing");
      assert.equal(fewShots.length, 1);
      assert.equal(fewShots[0].output, "currency check first");
    }
  },
  {
    name: "Constitution Layer: formats and enforces rules unbypassably",
    run: () => {
      const layer = new ConstitutionIntegrationLayer();
      
      const configStr = layer.compileConstitutionSection("tenant_1");
      assert.ok(configStr.includes("AI COGNITIVE CONSTITUTION"));
      assert.ok(configStr.includes("HALLUCINATION MITIGATION RULES"));

      const prompt = "Act as an assistant.";
      const enforced = layer.enforceConstitution(prompt, "tenant_1");
      assert.ok(enforced.startsWith("=== AI COGNITIVE CONSTITUTION"));
      assert.ok(enforced.includes("Act as an assistant."));
    }
  },
  {
    name: "Prompt Compiler: loads prompt template and compiles variables successfully",
    run: () => {
      const compiler = new PromptCompiler();

      // Compile prompt with variables
      const promptResult = compiler.compile(
        "tenant_1",
        "executive_core",
        "1.0.0",
        {
          input: "User asks about pricing",
          memories: "Memory: User is key partner.",
          knowledge: "Knowledge: Pricing starts at $10.",
          learnings: "Best Practice: Clear metrics.",
          tools: "Tools: queryBalance()",
          contract: "Output JSON"
        }
      );

      assert.ok(promptResult.system.includes("Sylph Executive AI"));
      assert.ok(promptResult.system.includes("Memory: User is key partner."));
      assert.ok(promptResult.system.includes("Knowledge: Pricing starts at $10."));
      assert.ok(promptResult.user.includes("User asks about pricing"));
    }
  },
  {
    name: "Reasoning Framework: traces pipeline and scores confidence",
    run: async () => {
      const di = new DIContainer();
      
      // Register components in local DI
      const constitutionLayer = new ConstitutionIntegrationLayer();
      const budgetManager = new ContextBudgetManager();
      const contextEngine = new ContextIntelligenceEngine(budgetManager);
      const memoryEngine = new MemoryEngine();
      const memorySelection = new MemorySelectionEngine(di);
      const knowledgeSelection = new KnowledgeSelectionEngine(di);
      const promptCompiler = new PromptCompiler(constitutionLayer);

      di.registerInstance("IConstitutionIntegrationLayer", constitutionLayer);
      di.registerInstance("IContextBudgetManager", budgetManager);
      di.registerInstance("IContextIntelligenceEngine", contextEngine);
      di.registerInstance("IMemoryEngine", memoryEngine);
      di.registerInstance("IMemorySelectionEngine", memorySelection);
      di.registerInstance("IKnowledgeSelectionEngine", knowledgeSelection);

      const framework = new ReasoningFramework(di, contextEngine, budgetManager, promptCompiler);

      // Execute deterministic reasoning
      const trace = await framework.reason("tenant_1", "What is my invoice cost?", { userRoles: ["admin"] });
      
      assert.ok(trace.id.startsWith("trace_tenant_1"));
      assert.equal(trace.intent, "billing_inquiry");
      assert.equal(trace.steps.length, 7); // Intent, Knowledge, Memory, Policies, Tools, Decision, Action
      assert.equal(trace.steps[0].step, "intent");
      assert.equal(trace.steps[trace.steps.length - 1].step, "action");
      assert.ok(trace.overallConfidence > 0);
      assert.ok(trace.explanation.length > 0);
    }
  }
];
