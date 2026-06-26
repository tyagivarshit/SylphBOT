import assert from "node:assert/strict";
import { DIContainer } from "../runtime/kernel/diContainer";
import { Bootstrapper } from "../runtime/kernel/bootstrap";
import { OrganizationGraph } from "../runtime/core/universalCore";
import { OigSecurityContext, OigQueryOptions } from "../runtime/oig/interfaces";
import { runWithRequestContext } from "../observability/requestContext";
import {
  RuntimeGovernanceEngine,
  SemanticResolutionLayer,
  DecisionMetadataEngine
} from "../runtime/governance";

export const oigTests: any[] = [
  {
    name: "OIG Core: Directed graph rejects orphan relationships",
    run: () => {
      const graph = new OrganizationGraph();
      const ctx: OigSecurityContext = { tenantId: "t1", actorId: "user1", scopes: ["oig:write"] };

      graph.addSecureNode({
        id: "node_a",
        type: "Entity",
        properties: { name: "Node A" },
        tenantId: "t1"
      }, ctx);

      // Try adding edge to non-existent target "node_b"
      assert.throws(() => {
        graph.addSecureEdge({
          sourceId: "node_a",
          targetId: "node_b",
          predicate: "OWNS",
          properties: {},
          tenantId: "t1"
        }, ctx);
      }, /Orphan Relationship Constraint/);
    }
  },
  {
    name: "OIG Node & Edge Models: supports extensible types and predicates",
    run: () => {
      const graph = new OrganizationGraph();
      const ctx: OigSecurityContext = { tenantId: "t1", actorId: "user1", scopes: ["oig:write"] };

      graph.addSecureNode({ id: "n1", type: "Document", properties: { path: "/doc" }, tenantId: "t1" }, ctx);
      graph.addSecureNode({ id: "n2", type: "Asset", properties: { price: 100 }, tenantId: "t1" }, ctx);
      graph.addSecureNode({ id: "n3", type: "Connector", properties: { type: "db" }, tenantId: "t1" }, ctx);

      graph.addSecureEdge({ sourceId: "n1", targetId: "n2", predicate: "REFERENCES", properties: {}, tenantId: "t1" }, ctx);
      graph.addSecureEdge({ sourceId: "n2", targetId: "n3", predicate: "DEPENDS_ON", properties: {}, tenantId: "t1" }, ctx);

      const node1 = graph.getNode("n1");
      const node3 = graph.getNode("n3");
      assert.equal(node1?.properties.path, "/doc");
      assert.equal(node3?.properties.type, "db");
    }
  },
  {
    name: "OIG Relationship Engine: handles versioning, updates, merging, archiving, and history tracking",
    run: () => {
      const graph = new OrganizationGraph();
      const ctx: OigSecurityContext = { tenantId: "t1", actorId: "user1", scopes: ["oig:write", "oig:read"] };

      graph.addSecureNode({ id: "n1", type: "Entity", properties: {}, tenantId: "t1" }, ctx);
      graph.addSecureNode({ id: "n2", type: "Resource", properties: {}, tenantId: "t1" }, ctx);

      // Create edge
      graph.addSecureEdge({ sourceId: "n1", targetId: "n2", predicate: "USES", properties: { active: true }, tenantId: "t1" }, ctx);
      
      // Update edge
      graph.updateEdgeProperties("n1", "n2", "USES", { active: false, usageCount: 5 }, ctx);

      // Verify versioning and history
      const history = graph.getEdgeHistory("n1", "n2", "USES", ctx);
      assert.equal(history.length, 2);
      assert.equal(history[0].version, 1);
      assert.equal(history[1].version, 2);
      assert.equal(history[1].properties.usageCount, 5);

      // Merge edges
      graph.addSecureEdge({ sourceId: "n1", targetId: "n2", predicate: "OWNS", properties: { value: 50 }, tenantId: "t1" }, ctx);
      graph.mergeEdges("n1", "n2", "USES", "OWNS", ctx);

      // Verify merged state
      const mergedHistory = graph.getEdgeHistory("n1", "n2", "USES", ctx);
      assert.equal(mergedHistory[mergedHistory.length - 1].action, "merge");
      assert.equal(mergedHistory[mergedHistory.length - 1].properties.value, 50);

      // Archive edge
      graph.archiveEdge("n1", "n2", "USES", ctx, "obsolete relationship");
      const finalHistory = graph.getEdgeHistory("n1", "n2", "USES", ctx);
      assert.equal(finalHistory[finalHistory.length - 1].action, "archive");
    }
  },
  {
    name: "OIG Graph Projection: generates snapshot, restores state, and reconstructs history from events",
    run: () => {
      const graph = new OrganizationGraph();
      const ctx: OigSecurityContext = { tenantId: "t1", actorId: "user1", scopes: ["oig:write"] };

      graph.addSecureNode({ id: "n1", type: "Entity", properties: { step: 1 }, tenantId: "t1" }, ctx);
      graph.addSecureNode({ id: "n2", type: "Resource", properties: {}, tenantId: "t1" }, ctx);
      graph.addSecureEdge({ sourceId: "n1", targetId: "n2", predicate: "USES", properties: {}, tenantId: "t1" }, ctx);

      const timestampBeforeUpdate = new Date();

      // Wait 2ms to ensure timestamp difference
      const start = Date.now();
      while (Date.now() - start < 5) {}

      graph.addSecureNode({ id: "n1", type: "Entity", properties: { step: 2 }, tenantId: "t1" }, ctx);

      // Generate Snapshot
      const snapshot = graph.generateSnapshot("t1");
      assert.equal(snapshot.nodes.length, 2);
      assert.equal(snapshot.nodes.find(n => n.id === "n1")?.properties.step, 2);

      // Test Reconstruction at historical timestamp
      const reconstructed = graph.reconstructAt("t1", timestampBeforeUpdate);
      const reconstructedN1 = reconstructed.nodes.find(n => n.id === "n1");
      assert.equal(reconstructedN1?.properties.step, 1);

      // Restore snapshot
      graph.addSecureNode({ id: "n3", type: "Entity", properties: {}, tenantId: "t1" }, ctx);
      assert.equal(graph.getNode("n3") !== null, true);

      graph.restoreFromSnapshot(snapshot);
      assert.equal(graph.getNode("n3"), null);
      assert.equal(graph.getNode("n1")?.properties.step, 2);
    }
  },
  {
    name: "OIG Query Engine: executes Breadth-First traversal, path-finding, dependency tree, and impact analysis",
    run: () => {
      const graph = new OrganizationGraph();
      const ctx: OigSecurityContext = { tenantId: "t1", actorId: "user1", scopes: ["oig:write", "oig:read"] };
      const opts: OigQueryOptions = { securityContext: ctx };

      // Set up simple dependency path: n1 -> n2 -> n3
      graph.addSecureNode({ id: "n1", type: "Entity", properties: {}, tenantId: "t1" }, ctx);
      graph.addSecureNode({ id: "n2", type: "Resource", properties: {}, tenantId: "t1" }, ctx);
      graph.addSecureNode({ id: "n3", type: "Tool", properties: {}, tenantId: "t1" }, ctx);

      graph.addSecureEdge({ sourceId: "n1", targetId: "n2", predicate: "DEPENDS_ON", properties: {}, tenantId: "t1" }, ctx);
      graph.addSecureEdge({ sourceId: "n2", targetId: "n3", predicate: "USES", properties: {}, tenantId: "t1" }, ctx);

      // Traverse BFS
      const bfsResult = graph.traverse("n1", opts);
      assert.equal(bfsResult.nodes.length, 3);
      assert.equal(bfsResult.paths.length, 2);

      // Find Paths
      const paths = graph.findPaths("n1", "n3", opts);
      assert.equal(paths.length, 1);
      assert.deepEqual(paths[0], ["n1", "n2", "n3"]);

      // Dependency Tree (incorporating USES)
      const depTree = graph.getDependencyTree("n1", opts);
      assert.equal(depTree.nodes.length, 3);

      // Impact Analysis
      const impact = graph.getImpactAnalysis("n2", opts);
      assert.equal(impact.nodes.length, 2);
      assert.equal(impact.nodes.some(n => n.id === "n1"), true);
    }
  },
  {
    name: "OIG Security Engine: enforces strict tenant isolation and blocks cross-tenant traversal",
    run: () => {
      const graph = new OrganizationGraph();
      const ctxTenant1: OigSecurityContext = { tenantId: "t1", actorId: "user1", scopes: ["oig:write"] };
      const ctxTenant2: OigSecurityContext = { tenantId: "t2", actorId: "user2", scopes: ["oig:write"] };

      graph.addSecureNode({ id: "node_t1", type: "Entity", properties: {}, tenantId: "t1" }, ctxTenant1);
      graph.addSecureNode({ id: "node_t2", type: "Entity", properties: {}, tenantId: "t2" }, ctxTenant2);

      // Verify cross-tenant addition blocked
      assert.throws(() => {
        graph.addSecureNode({ id: "node_bad", type: "Entity", properties: {}, tenantId: "t1" }, ctxTenant2);
      }, /Security Boundary Violation/);

      // Verify query tenant isolation
      assert.throws(() => {
        graph.traverse("node_t1", { securityContext: ctxTenant2 });
      }, /Security Boundary Violation/);
    }
  },
  {
    name: "OIG Plugin Support: registers custom node and edge validation constraints",
    run: () => {
      const graph = new OrganizationGraph();
      const ctx: OigSecurityContext = { tenantId: "t1", actorId: "user1", scopes: ["oig:write"] };

      // Register custom validator plugin
      graph.registerPluginConfig({
        pluginId: "custom_validator_plugin",
        nodeTypes: ["Entity"],
        relationshipTypes: ["OWNS"],
        validationRules: {
          validateNode: (node) => {
            if (node.type === "Entity" && !node.properties.name) {
              return { valid: false, error: "Entity name is mandatory." };
            }
            return { valid: true };
          },
          validateEdge: (edge, source, target) => {
            if (edge.predicate === "OWNS" && target.type !== "Resource") {
              return { valid: false, error: "Predicate OWNS must point to a Resource node." };
            }
            return { valid: true };
          }
        }
      });

      // Try adding node violating rule
      assert.throws(() => {
        graph.addSecureNode({ id: "bad_node", type: "Entity", properties: {}, tenantId: "t1" }, ctx);
      }, /Entity name is mandatory/);

      // Try adding valid node
      graph.addSecureNode({ id: "good_node", type: "Entity", properties: { name: "Valid" }, tenantId: "t1" }, ctx);
      
      // Try adding edge violating edge rule
      graph.addSecureNode({ id: "another_entity", type: "Entity", properties: { name: "Another" }, tenantId: "t1" }, ctx);
      assert.throws(() => {
        graph.addSecureEdge({ sourceId: "good_node", targetId: "another_entity", predicate: "OWNS", properties: {}, tenantId: "t1" }, ctx);
      }, /Predicate OWNS must point to a Resource node/);
    }
  },
  {
    name: "OIG Event Integration: synchronizes graph state automatically on event bus publishes",
    run: async () => {
      const container = new DIContainer();
      const bootstrapper = new Bootstrapper(container);
      await bootstrapper.bootstrap();

      const eventBus = container.resolve<any>("IEventBus");
      const graph = container.resolve<any>("IOrganizationIntelligenceGraph");

      // 1. Publish lead.created
      await eventBus.publish("lead.created", "1.0.0", {
        leadId: "lead_evt_test_1",
        businessId: "t_integration",
        platform: "web",
        stage: "NEW",
        name: "Acme Corp",
        status: "QUALIFIED",
        email: "contact@acme.com"
      }, { tenantId: "t_integration" });

      await new Promise(resolve => setTimeout(resolve, 10));

      const leadNode = graph.getNode("lead_evt_test_1");
      assert.ok(leadNode);
      assert.equal(leadNode.properties.name, "Acme Corp");

      // 2. Publish memory.fact.created
      await eventBus.publish("memory.fact.created", "1.0.0", {
        leadId: "lead_evt_test_1",
        key: "budget",
        value: "50000",
        confidence: 0.9,
        businessId: "t_integration"
      }, { tenantId: "t_integration" });

      await new Promise(resolve => setTimeout(resolve, 10));

      const factNode = graph.getNode("fact_lead_evt_test_1_budget");
      assert.ok(factNode);
      assert.equal(factNode.properties.value, "50000");

      const neighbors = graph.getNeighbors("lead_evt_test_1");
      assert.equal(neighbors.length, 1);
      assert.equal(neighbors[0].node.id, "fact_lead_evt_test_1_budget");
      assert.equal(neighbors[0].edge.predicate, "USES");

      await bootstrapper.shutdown();
    }
  },
  {
    name: "OIG Observability: tracks latency metrics, sync status, and performance statistics",
    run: () => {
      const graph = new OrganizationGraph();
      const ctx: OigSecurityContext = { tenantId: "t1", actorId: "user1", scopes: ["oig:write", "oig:read"] };

      graph.addSecureNode({ id: "n1", type: "Entity", properties: {}, tenantId: "t1" }, ctx);
      graph.addSecureNode({ id: "n2", type: "Resource", properties: {}, tenantId: "t1" }, ctx);
      graph.addSecureEdge({ sourceId: "n1", targetId: "n2", predicate: "USES", properties: {}, tenantId: "t1" }, ctx);

      // Perform a traversal query to record latency
      graph.traverse("n1", { securityContext: ctx });

      // Trigger metric check
      const metrics = graph.getMetrics();
      assert.equal(metrics.nodeCount, 2);
      assert.equal(metrics.edgeCount, 1);
      assert.ok(metrics.traversalLatencyAvgMs >= 0);
    }
  },
  {
    name: "OIG Context Propagation: propagates security context automatically via AsyncLocalStorage",
    run: () => {
      const graph = new OrganizationGraph();

      runWithRequestContext({
        requestId: "req_propagation_test",
        tenantId: "t_propagated",
        businessId: "t_propagated",
        userId: "actor_propagated",
        source: "worker"
      }, () => {
        // Add nodes without passing explicit securityContext parameter (Phase 8 requirement)
        graph.addSecureNode({
          id: "node_p1",
          type: "Entity",
          properties: { val: 42 },
          tenantId: "t_propagated"
        });

        graph.addSecureNode({
          id: "node_p2",
          type: "Resource",
          properties: {},
          tenantId: "t_propagated"
        });

        graph.addSecureEdge({
          sourceId: "node_p1",
          targetId: "node_p2",
          predicate: "OWNS",
          properties: {},
          tenantId: "t_propagated"
        });

        // Traverse using implicit context
        const traversal = graph.traverse("node_p1");
        assert.equal(traversal.nodes.length, 2);
        assert.equal(traversal.edges.length, 1);

        const metrics = graph.getMetrics();
        assert.ok(metrics.contextPropagationLatencyAvgMs >= 0);
      });
    }
  },
  {
    name: "OIG Privacy Guard: redacts PII properties recursively on write",
    run: () => {
      const graph = new OrganizationGraph();
      const ctx: OigSecurityContext = { tenantId: "t1", actorId: "user1", scopes: ["oig:write", "oig:read"] };

      graph.addSecureNode({
        id: "private_node",
        type: "Entity",
        properties: {
          email: "john.doe@automexia.ai",
          nested: {
            phone: "+1 650 555-1234",
            other: "public-data"
          }
        },
        tenantId: "t1"
      }, ctx);

      const node = graph.getNode("private_node");
      assert.ok(node);
      assert.equal(node.properties.email, "[REDACTED_EMAIL]");
      assert.equal(node.properties.nested.phone, "[REDACTED_PHONE]");
      assert.equal(node.properties.nested.other, "public-data");
    }
  },
  {
    name: "OIG Security Engine: enforces scope permissions and records governance policy violations",
    run: () => {
      const graph = new OrganizationGraph();
      
      // Node creation with WRITE scope
      const ctxWriteOnly: OigSecurityContext = { tenantId: "t1", actorId: "user1", scopes: ["oig:write"] };
      const ctxReadOnly: OigSecurityContext = { tenantId: "t1", actorId: "user2", scopes: ["oig:read"] };
      const ctxNoScope: OigSecurityContext = { tenantId: "t1", actorId: "user3", scopes: [] };

      // Try adding node with READ only scope
      assert.throws(() => {
        graph.addSecureNode({ id: "n1", type: "Entity", properties: {}, tenantId: "t1" }, ctxReadOnly);
      }, /Security Scope Violation/);

      // Add validly with write scope
      graph.addSecureNode({ id: "n1", type: "Entity", properties: {}, tenantId: "t1" }, ctxWriteOnly);

      // Try reading with no scopes
      assert.throws(() => {
        graph.traverse("n1", { securityContext: ctxNoScope });
      }, /Security Scope Violation/);

      // Verify that violations were tracked in observability telemetry (Phase 9)
      const metrics = graph.getMetrics();
      assert.equal(metrics.runtimeGovernanceViolationsCount, 2);
    }
  },
  {
    name: "OIG Traceability: stores evidence, source references, and confidence scores",
    run: () => {
      const graph = new OrganizationGraph();
      const ctx: OigSecurityContext = { tenantId: "t1", actorId: "user1", scopes: ["oig:write", "oig:read"] };

      graph.addSecureNode({
        id: "trace_node",
        type: "Knowledge",
        properties: {},
        tenantId: "t1",
        evidenceReferences: ["doc_url_1"],
        sourceReferences: ["email_thread_abc"],
        confidenceScore: 0.95,
        executionTrace: ["workflow_step_1", "nlp_parse_2"]
      }, ctx);

      const metrics = graph.getMetrics();
      assert.equal(metrics.decisionMetadataCreationCount, 1);
    }
  },
  {
    name: "Runtime Governance & Plugin Lifecycle: manages state transitions, freeze rules, and compatibility policies",
    run: async () => {
      const graph = new OrganizationGraph();
      const gov = new RuntimeGovernanceEngine(null, null);

      // Verify initial plugin state
      assert.equal(gov.getPluginState("my_test_plugin"), "Installed");

      // Verify allowed transitions
      await gov.transitionPlugin("my_test_plugin", "Validated");
      assert.equal(gov.getPluginState("my_test_plugin"), "Validated");

      // Verify blocked invalid transitions (skipping Loaded)
      await assert.rejects(async () => {
        await gov.transitionPlugin("my_test_plugin", "Running");
      }, /Plugin Lifecycle Violation/);

      // Verify Compatibility Rule (CompatibilityRule evaluation)
      const compatCheck = gov.evaluatePolicy("policy.plugin_compatibility", { tenantId: "t1", actorId: "user1" }, {
        version: "1.2.0",
        requiredMinVersion: "1.5.0"
      });
      assert.equal(compatCheck.allowed, false);

      // Verify active Runtime Freeze restricts writes (FreezeRule evaluation)
      const ctxUser: OigSecurityContext = { tenantId: "t_frozen", actorId: "user1", roles: ["USER"] };
      const ctxAdmin: OigSecurityContext = { tenantId: "t_frozen", actorId: "admin", roles: ["ADMIN"] };

      gov.setRuntimeFreeze("t_frozen", true, ctxAdmin);
      assert.equal(gov.isRuntimeFrozen("t_frozen"), true);

      // User write check
      const userWrite = gov.evaluatePolicy("policy.freeze_check", ctxUser, { action: "write" });
      assert.equal(userWrite.allowed, false);

      // Admin write check
      const adminWrite = gov.evaluatePolicy("policy.freeze_check", ctxAdmin, { action: "write" });
      assert.equal(adminWrite.allowed, true);

      // Unfreeze
      gov.setRuntimeFreeze("t_frozen", false, ctxAdmin);
      assert.equal(gov.isRuntimeFrozen("t_frozen"), false);
    }
  },
  {
    name: "Semantic Resolution Layer: resolves alias, equivalence, and transitive subclass inheritance",
    run: () => {
      const graph = new OrganizationGraph();
      const sem = new SemanticResolutionLayer(graph);
      const ctx: OigSecurityContext = { tenantId: "t1", actorId: "user1", scopes: ["oig:write", "oig:read"] };

      // Set up nodes
      graph.addSecureNode({ id: "canon_lead", type: "Entity", properties: { aliases: ["alias_lead_123"] }, tenantId: "t1" }, ctx);
      graph.addSecureNode({ id: "node_x", type: "Entity", properties: {}, tenantId: "t1" }, ctx);
      graph.addSecureNode({ id: "node_y", type: "Entity", properties: {}, tenantId: "t1" }, ctx);

      // Link equivalence
      graph.addSecureEdge({ sourceId: "node_x", targetId: "node_y", predicate: "EQUIVALENT_TO", properties: {}, tenantId: "t1" }, ctx);

      // Set up class inheritance hierarchy: A -> B -> C
      graph.addSecureNode({ id: "class_c", type: "Class", properties: {}, tenantId: "t1" }, ctx);
      graph.addSecureNode({ id: "class_b", type: "Class", properties: {}, tenantId: "t1" }, ctx);
      graph.addSecureNode({ id: "node_a", type: "Entity", properties: {}, tenantId: "t1" }, ctx);

      graph.addSecureEdge({ sourceId: "node_a", targetId: "class_b", predicate: "DEPENDS_ON", properties: {}, tenantId: "t1" }, ctx);
      graph.addSecureEdge({ sourceId: "class_b", targetId: "class_c", predicate: "INHERITS_FROM", properties: {}, tenantId: "t1" }, ctx);

      // 1. Alias Resolution
      const resolved = sem.resolveAlias("t1", "alias_lead_123");
      assert.equal(resolved, "canon_lead");

      // 2. Equivalent Entities
      const equivalents = sem.resolveEquivalentEntities("t1", "node_x");
      assert.equal(equivalents.includes("node_y"), true);

      // 3. Transitive Expansion
      const expanded = sem.resolveRelationshipExpansion("t1", "node_a", "DEPENDS_ON");
      assert.equal(expanded.includes("class_c"), true);
    }
  },
  {
    name: "Decision Metadata Engine: records trace paths and performs dynamic privacy scrubbing",
    run: () => {
      const graph = new OrganizationGraph();
      const decEngine = new DecisionMetadataEngine(graph);

      const decision = decEngine.storeDecision({
        decisionId: "dec_1",
        tenantId: "t1",
        evidenceReferences: ["evt_ref_1"],
        sourceReferences: ["user_message_ref"],
        confidenceScore: 0.99,
        executionTrace: ["step_1", "step_2"],
        validationResults: {
          success: true,
          email: "confidential_person@automexia.ai"
        },
        auditMetadata: {
          callerPhone: "+1 650 555-9876"
        }
      });

      assert.equal(decision.decisionId, "dec_1");
      // Check privacy redactions
      assert.equal(decision.validationResults.email, "[REDACTED_EMAIL]");
      assert.equal(decision.auditMetadata.callerPhone, "[REDACTED_PHONE]");

      // Retrieve decision
      const retrieved = decEngine.getDecision("dec_1");
      assert.ok(retrieved);
      assert.equal(retrieved.confidenceScore, 0.99);
    }
  }
];
