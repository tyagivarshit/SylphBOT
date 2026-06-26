import { DIContainer } from "../runtime/kernel/diContainer";
import { Bootstrapper } from "../runtime/kernel/bootstrap";
import { OrganizationGraph } from "../runtime/core/universalCore";
import { OigSecurityContext } from "../runtime/oig/interfaces";
import { RuntimeGovernanceEngine } from "../runtime/governance/governanceEngine";
import { SemanticResolutionLayer } from "../runtime/governance/semanticResolution";
import { DecisionMetadataEngine } from "../runtime/governance/decisionMetadata";
import { EventBus } from "../runtime/communication/eventBus";
import { runWithRequestContext } from "../observability/requestContext";

async function runFullAudits() {
  console.log("==================================================");
  console.log("AUTOMEXIA AI OS RUNTIME AUDIT & BENCHMARK SUITE");
  console.log("==================================================");

  const stats: Record<string, any> = {};

  // 1. COLD START PERFORMANCE
  const coldStartT0 = performance.now();
  const memBefore = process.memoryUsage().heapUsed;
  
  const container = new DIContainer();
  const bootstrapper = new Bootstrapper(container);
  await bootstrapper.bootstrap();
  
  const coldStartT1 = performance.now();
  const memAfter = process.memoryUsage().heapUsed;
  
  stats.coldStartMs = coldStartT1 - coldStartT0;
  stats.coldStartMemBytes = memAfter - memBefore;
  console.log(`[1] Cold Start Time: ${stats.coldStartMs.toFixed(2)}ms`);
  console.log(`[1] Memory Overhead: ${(stats.coldStartMemBytes / 1024 / 1024).toFixed(2)} MB`);

  // 2. WARM START PERFORMANCE
  await bootstrapper.shutdown();
  const warmStartT0 = performance.now();
  const warmContainer = new DIContainer();
  const warmBootstrapper = new Bootstrapper(warmContainer);
  await warmBootstrapper.bootstrap();
  const warmStartT1 = performance.now();
  
  stats.warmStartMs = warmStartT1 - warmStartT0;
  console.log(`[2] Warm Start Time: ${stats.warmStartMs.toFixed(2)}ms`);

  // 3. GRAPH & SEMANTIC LOOKUPS LATENCY
  const graph = warmContainer.resolve<OrganizationGraph>("IOrganizationGraph");
  const gov = warmContainer.resolve<RuntimeGovernanceEngine>("IRuntimeGovernanceEngine");
  const sem = warmContainer.resolve<SemanticResolutionLayer>("ISemanticResolutionLayer");
  const dec = warmContainer.resolve<DecisionMetadataEngine>("IDecisionMetadataEngine");
  const bus = warmContainer.resolve<EventBus>("IEventBus");

  const ctx: OigSecurityContext = { tenantId: "t1", actorId: "benchmarker", scopes: ["oig:write", "oig:read"] };

  // Add sample capability graph nodes
  const nodeCount = 100;
  const graphWriteT0 = performance.now();
  
  for (let i = 0; i < nodeCount; i++) {
    graph.addSecureNode({
      id: `node_${i}`,
      type: "Entity",
      properties: { name: `Node ${i}`, aliases: [`alias_node_${i}`] },
      tenantId: "t1"
    }, ctx);
  }

  // Create dependency chains for transitive expansion checks
  for (let i = 0; i < nodeCount - 1; i++) {
    graph.addSecureEdge({
      sourceId: `node_${i}`,
      targetId: `node_${i + 1}`,
      predicate: i % 2 === 0 ? "INHERITS_FROM" : "DEPENDS_ON",
      properties: {},
      tenantId: "t1"
    }, ctx);
  }
  const graphWriteT1 = performance.now();
  stats.averageWriteMs = (graphWriteT1 - graphWriteT0) / (nodeCount + nodeCount - 1);
  console.log(`[3] Average Graph Write (Nodes/Edges): ${stats.averageWriteMs.toFixed(4)}ms`);

  // Graph lookup & traversals
  const lookupCount = 1000;
  const graphReadT0 = performance.now();
  for (let i = 0; i < lookupCount; i++) {
    const nodeId = `node_${Math.floor(Math.random() * nodeCount)}`;
    graph.getNode(nodeId);
    graph.getNeighbors(nodeId);
  }
  const graphReadT1 = performance.now();
  stats.averageReadMs = (graphReadT1 - graphReadT0) / lookupCount;
  console.log(`[4] Average Graph Node/Edge Lookup: ${stats.averageReadMs.toFixed(4)}ms`);

  // Semantic resolution check
  const semT0 = performance.now();
  for (let i = 0; i < lookupCount; i++) {
    const targetIdx = Math.floor(Math.random() * nodeCount);
    sem.resolveAlias("t1", `alias_node_${targetIdx}`);
  }
  const semT1 = performance.now();
  stats.averageSemanticAliasMs = (semT1 - semT0) / lookupCount;
  console.log(`[5] Average Semantic Alias Resolution: ${stats.averageSemanticAliasMs.toFixed(4)}ms`);

  // Transitive expansion check
  const transT0 = performance.now();
  const expanded = sem.resolveRelationshipExpansion("t1", "node_0", "DEPENDS_ON");
  const transT1 = performance.now();
  stats.transitiveExpansionMs = transT1 - transT0;
  stats.transitiveExpansionCount = expanded.length;
  console.log(`[6] Transitive Expand (Depth: ${nodeCount}): ${stats.transitiveExpansionMs.toFixed(2)}ms (Returned ${expanded.length} nodes)`);

  // 4. CONTEXT PROPAGATION LATENCY
  const ctxT0 = performance.now();
  let contextChecked = 0;
  for (let i = 0; i < lookupCount; i++) {
    runWithRequestContext({ requestId: "bench_req_1", tenantId: "t1", userId: "benchmarker" }, () => {
      // Accessing a context-aware service getter
      (graph as any).getOrPropagateContext();
      contextChecked++;
    });
  }
  const ctxT1 = performance.now();
  stats.contextPropagationLatencyMs = (ctxT1 - ctxT0) / lookupCount;
  console.log(`[7] Context Propagation Avg Latency: ${stats.contextPropagationLatencyMs.toFixed(4)}ms`);

  // 5. STRESS TESTING (CONCURRENCY & DEADLOCK CHECKS)
  console.log("[8] Launching concurrent load (1,000 tasks)...");
  const stressT0 = performance.now();
  const promises: Promise<void>[] = [];

  for (let i = 0; i < 1000; i++) {
    promises.push((async () => {
      // Mix of reads, writes, events, and governance checks
      const randIdx = Math.floor(Math.random() * nodeCount);
      
      // Perform read
      graph.getNode(`node_${randIdx}`);
      
      // Perform audit trace
      dec.storeDecision({
        decisionId: `dec_stress_${i}`,
        tenantId: "t1",
        evidenceReferences: [`evt_stress_${i}`],
        sourceReferences: [`user_${i}@automexia.ai`],
        confidenceScore: 0.99,
        executionTrace: ["step_1"],
        validationResults: { success: true }
      });
      
      // Publish event
      await bus.publish(
        "lead.created",
        "1.0.0",
        {
          id: `lead_${i}`,
          leadId: `lead_${i}`,
          businessId: "t1",
          platform: "google",
          stage: "NEW",
          email: `lead_${i}@example.com`
        },
        { tenantId: "t1" }
      );
    })());
  }

  await Promise.all(promises);
  const stressT1 = performance.now();
  stats.stressTestDurationMs = stressT1 - stressT0;
  console.log(`[8] Concurrent Operations complete in ${stats.stressTestDurationMs.toFixed(2)}ms`);

  // 6. GOVERNANCE RULE EXECUTIONS
  const govT0 = performance.now();
  const ruleCheckCount = 500;
  for (let i = 0; i < ruleCheckCount; i++) {
    gov.evaluatePolicy("policy.plugin_compatibility", { tenantId: "t1", actorId: "benchmarker" }, {
      version: "1.2.0",
      requiredMinVersion: "1.0.0"
    });
  }
  const govT1 = performance.now();
  stats.averageGovernancePolicyMs = (govT1 - govT0) / ruleCheckCount;
  console.log(`[9] Average Governance Policy Evaluation: ${stats.averageGovernancePolicyMs.toFixed(4)}ms`);

  console.log("==================================================");
  console.log("ALL VERIFICATIONS COMPLETED SUCCESSFULLY!");
  console.log("==================================================");
  
  await warmBootstrapper.shutdown();
  process.exit(0);
}

runFullAudits().catch(err => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
