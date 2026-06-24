import { ReasoningTrace, ReasoningStep, ContextItem } from "./types";
import { DIContainer, container } from "../kernel/diContainer";
import { IModelManager } from "../interfaces/core";
import { ContextIntelligenceEngine, ContextBudgetManager } from "./contextEngine";
import { MemoryEngine } from "./memoryEngine";
import { MemorySelectionEngine } from "./memorySelection";
import { KnowledgeSelectionEngine } from "./knowledgeSelection";
import { LearningRegistry } from "./learningRegistry";
import { ConstitutionIntegrationLayer } from "./constitutionLayer";
import { PromptCompiler } from "./promptCompiler";

export class ReasoningFramework {
  private diContainer: DIContainer;
  private contextEngine: ContextIntelligenceEngine;
  private budgetManager: ContextBudgetManager;
  private promptCompiler: PromptCompiler;

  constructor(
    diContainer: DIContainer = container,
    contextEngine = new ContextIntelligenceEngine(),
    budgetManager = new ContextBudgetManager(),
    promptCompiler = new PromptCompiler()
  ) {
    this.diContainer = diContainer;
    this.contextEngine = contextEngine;
    this.budgetManager = budgetManager;
    this.promptCompiler = promptCompiler;
  }

  /**
   * Execute the full reasoning pipeline for a tenant query.
   */
  public async reason(
    tenantId: string,
    query: string,
    options: {
      userRoles?: string[];
      maxTokens?: number;
      intentOverride?: string;
    } = {}
  ): Promise<ReasoningTrace> {
    const traceId = `trace_${tenantId}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const steps: ReasoningStep[] = [];
    const userRoles = options.userRoles || ["user"];
    const maxTokens = options.maxTokens || 4096;

    // Resolve allocations
    const budget = this.budgetManager.getBudget(maxTokens);

    // 1. INTENT RESOLUTION
    const intentStart = new Date();
    const intent = options.intentOverride || this.heuristicallyDetermineIntent(query);
    steps.push({
      step: "intent",
      timestamp: intentStart,
      input: { query },
      output: { intent },
      confidence: 0.9,
      explanation: `Heuristically classified user intent as [${intent}] from input query.`
    });

    // 2. KNOWLEDGE SELECTION
    const knowledgeStart = new Date();
    let selectedKnowledgeText = "";
    let knowledgeConfidence = 0.5;
    try {
      if (this.diContainer.has("IKnowledgeSelectionEngine") && this.diContainer.has("IKnowledgeStore")) {
        const knowledgeSelection = this.diContainer.resolve<KnowledgeSelectionEngine>("IKnowledgeSelectionEngine");
        const knowledgeStore = this.diContainer.resolve<any>("IKnowledgeStore");
        const items = await knowledgeStore.getKnowledgeItems(tenantId) || [];
        const selected = await knowledgeSelection.selectKnowledge(items, query, budget.allocations.knowledge);
        
        selectedKnowledgeText = selected.map(item => item.content).join("\n\n");
        knowledgeConfidence = selected.length > 0 ? Math.max(...selected.map(s => s.confidence)) : 0.8;
      } else {
        selectedKnowledgeText = "No RAG knowledge items loaded.";
        knowledgeConfidence = 1.0; // fully confident in default state
      }
    } catch (err) {
      selectedKnowledgeText = `Error fetching knowledge: ${String(err)}`;
      knowledgeConfidence = 0.0;
    }
    steps.push({
      step: "knowledge",
      timestamp: knowledgeStart,
      input: { intent, budget: budget.allocations.knowledge },
      output: { knowledgeText: selectedKnowledgeText },
      confidence: knowledgeConfidence,
      explanation: "Queried relevant system and domain knowledge boundaries."
    });

    // 3. MEMORY RETRIEVAL
    const memoryStart = new Date();
    let selectedMemoryText = "";
    let memoryConfidence = 0.5;
    try {
      if (this.diContainer.has("IMemoryEngine") && this.diContainer.has("IMemorySelectionEngine")) {
        const memoryEngine = this.diContainer.resolve<MemoryEngine>("IMemoryEngine");
        const memorySelection = this.diContainer.resolve<MemorySelectionEngine>("IMemorySelectionEngine");
        
        // Search memory
        const memories = await memoryEngine.searchMemory(tenantId, "customer", query, userRoles);
        const selected = await memorySelection.selectMemories(memories, query, budget.allocations.memory);
        
        selectedMemoryText = selected.map(m => `${m.key}: ${m.value}`).join("\n");
        memoryConfidence = selected.length > 0 ? Math.max(...selected.map(m => m.confidence)) : 0.8;
      } else {
        selectedMemoryText = "No user memory records found.";
        memoryConfidence = 1.0;
      }
    } catch (err) {
      selectedMemoryText = `Error loading memory: ${String(err)}`;
      memoryConfidence = 0.0;
    }
    steps.push({
      step: "memory",
      timestamp: memoryStart,
      input: { query, budget: budget.allocations.memory },
      output: { memoryText: selectedMemoryText },
      confidence: memoryConfidence,
      explanation: "Retrieved past interaction facts and business records matching current context."
    });

    // 4. POLICIES ASSESSMENT
    const policyStart = new Date();
    let activePolicies: string[] = [];
    try {
      if (this.diContainer.has("IConstitutionIntegrationLayer")) {
        const constitutionLayer = this.diContainer.resolve<ConstitutionIntegrationLayer>("IConstitutionIntegrationLayer");
        const constitution = constitutionLayer.getConstitution(tenantId);
        activePolicies = [...constitution.policies, ...constitution.escalationRules];
      } else {
        activePolicies = ["Default system policies active."];
      }
    } catch (err) {
      activePolicies = ["Error building policies list."];
    }
    steps.push({
      step: "policies",
      timestamp: policyStart,
      input: { tenantId },
      output: { activePolicies },
      confidence: 1.0,
      explanation: "Evaluated active safety rules, escalation parameters, and brand policies."
    });

    // 5. TOOLS RESOLUTION
    const toolsStart = new Date();
    let toolsText = "";
    try {
      if (this.diContainer.has("ICapabilityRegistry")) {
        const capabilityRegistry = this.diContainer.resolve<any>("ICapabilityRegistry");
        const caps = await capabilityRegistry.getAgentCapabilities("executive") || null;
        toolsText = caps ? JSON.stringify(caps) : "No capabilities registered.";
      } else {
        toolsText = "Default cognitive capabilities resolved.";
      }
    } catch (err) {
      toolsText = "Error resolving tools capability.";
    }
    steps.push({
      step: "tools",
      timestamp: toolsStart,
      input: { intent },
      output: { toolsText },
      confidence: 1.0,
      explanation: "Scanned available tools matching permission scopes and intent requirements."
    });

    // 6 & 7. DECISION AND ACTION SYNTHESIS
    const decisionStart = new Date();
    let decision = "";
    let action = "";
    let overallConfidence = 0.8;
    let explanation = "";

    try {
      if (this.diContainer.has("IModelManager")) {
        const modelManager = this.diContainer.resolve<IModelManager>("IModelManager");
        const promptResult = this.promptCompiler.compile(
          tenantId,
          "executive_core",
          "1.0.0",
          {
            input: query,
            memories: selectedMemoryText,
            knowledge: selectedKnowledgeText,
            learnings: activePolicies.join("\n"),
            tools: toolsText,
            contract: "JSON response with decision and action plan"
          }
        );

        const completion = await modelManager.generateCompletion([
          { role: "system", content: promptResult.system },
          { role: "user", content: promptResult.user }
        ], { temperature: 0.1, jsonMode: true });

        const payload = JSON.parse(completion.content);
        decision = payload.decision || "Default reasoning response executed.";
        action = payload.action || "Default execution flow.";
        overallConfidence = payload.confidence ?? 0.85;
        explanation = payload.explanation || "Inference executed successfully.";
      } else {
        // Deterministic Fallback Mode
        decision = `Resolved intent [${intent}] successfully based on policies.`;
        action = `Execute system response for [${intent}] flow.`;
        overallConfidence = (knowledgeConfidence + memoryConfidence) / 2;
        explanation = "Completed cognitive evaluation. No LLM active. Falling back to deterministic orchestration.";
      }
    } catch (err) {
      decision = "Trigger safety failover fallback.";
      action = "Escalate to human queue.";
      overallConfidence = 0.3;
      explanation = `Reasoning pipeline exception: ${String(err)}`;
    }

    steps.push({
      step: "decision",
      timestamp: decisionStart,
      input: { steps: steps.map(s => s.step) },
      output: { decision, explanation },
      confidence: overallConfidence,
      explanation: "Synthesized final cognitive resolution path."
    });

    steps.push({
      step: "action",
      timestamp: new Date(),
      input: { decision },
      output: { action },
      confidence: overallConfidence,
      explanation: "Compiled action execution instructions and contracts."
    });

    return {
      id: traceId,
      tenantId,
      intent,
      steps,
      finalDecision: decision,
      finalAction: action,
      overallConfidence,
      explanation
    };
  }

  /**
   * Quick heuristic regex-based intent classification for business-agnostic requests.
   */
  private heuristicallyDetermineIntent(query: string): string {
    const q = query.toLowerCase();
    if (q.includes("price") || q.includes("cost") || q.includes("billing") || q.includes("pay")) {
      return "billing_inquiry";
    }
    if (q.includes("schedule") || q.includes("book") || q.includes("appointment") || q.includes("calendar")) {
      return "appointment_booking";
    }
    if (q.includes("help") || q.includes("support") || q.includes("error") || q.includes("fail")) {
      return "support_request";
    }
    return "general_inquiry";
  }
}
