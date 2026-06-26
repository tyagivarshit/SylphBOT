import assert from "node:assert/strict";
import { container } from "../runtime/core";
import { bootstrapper, Bootstrapper } from "../runtime/kernel/bootstrap";
import { DIContainer } from "../runtime/kernel/diContainer";
import { StateProjectionEngine, PluginRegistry, OrganizationGraph } from "../runtime/core/universalCore";
import { IValueFlowEvent, IStateProjection, IDomainPlugin, IGraphNode, IGraphEdge } from "../runtime/interfaces/universal";

export const universalCoreTests: any[] = [
  {
    name: "Universal Resource Model: correctly models generic resources and metadata",
    run: () => {
      const gpuResource = {
        id: "res_gpu_01",
        type: "gpu_time",
        ownerId: "department_deeplearning",
        quantity: 128,
        unit: "hours",
        state: "available",
        metadata: { gpuModel: "H100", region: "us-west-2" },
        version: 1,
        updatedAt: new Date()
      };

      assert.equal(gpuResource.id, "res_gpu_01");
      assert.equal(gpuResource.type, "gpu_time");
      assert.equal(gpuResource.quantity, 128);
      assert.equal(gpuResource.metadata.gpuModel, "H100");
    }
  },
  {
    name: "Universal Entity Model: models generic actor primitives and relationships",
    run: () => {
      const entity = {
        id: "ent_robot_8",
        type: "robot",
        name: "Delivery Drone v4",
        tenantId: "warehouse_hq",
        relationships: [
          { targetId: "ent_department_shipping", predicate: "ASSIGNED_TO" },
          { targetId: "res_battery_packs", predicate: "CONSUMES" }
        ],
        metadata: { batteryLevel: 88, status: "active" },
        status: "ONLINE"
      };

      assert.equal(entity.id, "ent_robot_8");
      assert.equal(entity.type, "robot");
      assert.equal(entity.relationships.length, 2);
      assert.equal(entity.relationships[0].predicate, "ASSIGNED_TO");
    }
  },
  {
    name: "Universal Interaction Model: models generic communications between entities",
    run: () => {
      const interaction = {
        id: "int_ping_99",
        type: "heartbeat",
        participants: ["ent_sensor_2", "ent_central_server"],
        channel: "udp_ping",
        state: "completed",
        metadata: { latencyMs: 4.2 },
        startedAt: new Date()
      };

      assert.equal(interaction.id, "int_ping_99");
      assert.equal(interaction.participants.length, 2);
      assert.equal(interaction.metadata.latencyMs, 4.2);
    }
  },
  {
    name: "State Projection Engine: processes chronological Value Flow events to compute correct balances",
    run: () => {
      const engine = new StateProjectionEngine();
      const resourceId = "res_carbon_credits";

      const events: IValueFlowEvent[] = [
        {
          id: "evt_1",
          tenantId: "ngo_green",
          resourceId,
          flowType: "Created",
          amount: 500,
          timestamp: new Date("2026-06-01T12:00:00Z"),
          metadata: {}
        },
        {
          id: "evt_3",
          tenantId: "ngo_green",
          resourceId,
          flowType: "Consumed",
          amount: 100,
          timestamp: new Date("2026-06-03T12:00:00Z"),
          metadata: {}
        },
        {
          id: "evt_2",
          tenantId: "ngo_green",
          resourceId,
          flowType: "Reserved",
          amount: 200,
          timestamp: new Date("2026-06-02T12:00:00Z"), // Out of order timestamp
          metadata: {}
        }
      ];

      // Replay all events
      const projection = engine.project(events);

      assert.equal(projection.resourceId, resourceId);
      assert.equal(projection.currentState, "Consumed"); // Sorted latest event
      assert.equal(projection.totalAllocated, 200); // Reserved/Allocated total
      assert.equal(projection.totalConsumed, 100);
      assert.equal(projection.balance, 400); // 500 created - 100 consumed = 400
      assert.equal(projection.history[0].id, "evt_1"); // Sorted chronologically
      assert.equal(projection.history[1].id, "evt_2");
      assert.equal(projection.history[2].id, "evt_3");
    }
  },
  {
    name: "State Projection Engine: performs incremental projection updates",
    run: () => {
      const engine = new StateProjectionEngine();
      const resourceId = "res_token_bucks";

      const baseProjection: IStateProjection = {
        resourceId,
        currentState: "Created",
        totalAllocated: 0,
        totalConsumed: 0,
        balance: 100,
        lastUpdated: new Date("2026-06-01T00:00:00Z"),
        history: [
          {
            id: "evt_base",
            tenantId: "t1",
            resourceId,
            flowType: "Created",
            amount: 100,
            timestamp: new Date("2026-06-01T00:00:00Z"),
            metadata: {}
          }
        ]
      };

      const newEvent: IValueFlowEvent = {
        id: "evt_alloc",
        tenantId: "t1",
        resourceId,
        flowType: "Allocated",
        amount: 30,
        timestamp: new Date("2026-06-02T00:00:00Z"),
        metadata: {}
      };

      const updated = engine.projectIncremental(baseProjection, newEvent);

      assert.equal(updated.currentState, "Allocated");
      assert.equal(updated.balance, 100); // Allocated does not reduce balance until consumed
      assert.equal(updated.totalAllocated, 30);
      assert.equal(updated.history.length, 2);

      const consumeEvent: IValueFlowEvent = {
        id: "evt_consume",
        tenantId: "t1",
        resourceId,
        flowType: "Consumed",
        amount: 25,
        timestamp: new Date("2026-06-03T00:00:00Z"),
        metadata: {}
      };

      const finalProj = engine.projectIncremental(updated, consumeEvent);
      assert.equal(finalProj.currentState, "Consumed");
      assert.equal(finalProj.balance, 75); // 100 - 25 = 75
      assert.equal(finalProj.totalConsumed, 25);
    }
  },
  {
    name: "Plugin Registry: dynamically registers and unregisters custom plugins",
    run: async () => {
      const mockContainer = {
        resolved: [] as string[],
        resolve(name: string) { return name; }
      };

      const registry = new PluginRegistry(mockContainer);

      let onRegisterCalled = false;
      let onUnregisterCalled = false;

      const dummyPlugin: IDomainPlugin = {
        id: "plugin.dummy",
        name: "Dummy Test Plugin",
        version: "1.2.3",
        supportedDomains: ["dummy_domain"],
        capabilities: ["test_cap"],
        onRegister: async (container: any) => {
          onRegisterCalled = true;
          container.resolved.push("dummy_success");
        },
        onUnregister: async (container: any) => {
          onUnregisterCalled = true;
        }
      };

      await registry.registerPlugin(dummyPlugin);

      assert.equal(registry.getPlugin("plugin.dummy"), dummyPlugin);
      assert.equal(onRegisterCalled, true);
      assert.deepEqual(mockContainer.resolved, ["dummy_success"]);
      assert.equal(registry.listPlugins().length, 1);

      // Prevent duplicate registrations
      await assert.rejects(async () => {
        await registry.registerPlugin(dummyPlugin);
      }, /already registered/);

      await registry.unregisterPlugin("plugin.dummy");
      assert.equal(registry.getPlugin("plugin.dummy"), null);
      assert.equal(onUnregisterCalled, true);
      assert.equal(registry.listPlugins().length, 0);
    }
  },
  {
    name: "Organization Graph: tracks domain-independent entities, tools, events, and relationships",
    run: () => {
      const graph = new OrganizationGraph();

      const entNode: IGraphNode = {
        id: "node_hospital",
        type: "Organization",
        properties: { name: "City General Hospital", city: "New York" }
      };

      const toolNode: IGraphNode = {
        id: "node_mri_tool",
        type: "Tool",
        properties: { name: "mri_scanner", category: "medical" }
      };

      graph.addNode(entNode);
      graph.addNode(toolNode);

      assert.equal(graph.getNode("node_hospital")?.properties.city, "New York");

      const edge: IGraphEdge = {
        sourceId: "node_hospital",
        targetId: "node_mri_tool",
        predicate: "EQUIPPED_WITH",
        properties: { acquiredAt: "2026-01-10" }
      };

      graph.addEdge(edge);

      const neighbors = graph.getNeighbors("node_hospital");
      assert.equal(neighbors.length, 1);
      assert.equal(neighbors[0].node.id, "node_mri_tool");
      assert.equal(neighbors[0].edge.predicate, "EQUIPPED_WITH");

      // Query by criteria
      const matchingNodes = graph.query({ type: "Tool", properties: { category: "medical" } });
      assert.equal(matchingNodes.length, 1);
      assert.equal(matchingNodes[0].id, "node_mri_tool");
    }
  },
  {
    name: "Universal Core Runtime: verifies registration of core services and backward compatibility",
    run: async () => {
      // Re-bootstrap using a clean container
      const testContainer = new DIContainer();
      const testBootstrapper = new Bootstrapper(testContainer);
      await testBootstrapper.bootstrap();

      assert.ok(testContainer.has("IStateProjectionEngine"));
      assert.ok(testContainer.has("IPluginRegistry"));
      assert.ok(testContainer.has("IOrganizationGraph"));

      const pluginRegistry = testContainer.resolve<PluginRegistry>("IPluginRegistry");
      const plugins = pluginRegistry.listPlugins();

      // Verify that all 6 domain plugins are registered successfully
      assert.ok(plugins.some(p => p.id === "plugin.knowledge"));
      assert.ok(plugins.some(p => p.id === "plugin.crm"));
      assert.ok(plugins.some(p => p.id === "plugin.conversation"));
      assert.ok(plugins.some(p => p.id === "plugin.growth"));
      assert.ok(plugins.some(p => p.id === "plugin.scheduling"));
      assert.ok(plugins.some(p => p.id === "plugin.finance"));

      await testBootstrapper.shutdown();
    }
  }
];
