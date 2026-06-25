import assert from "node:assert/strict";
import {
  ModelRegistry,
  ProviderRegistry,
  ModelRouter,
  FallbackManager,
  ModelHealthMonitor,
  ModelCostManager,
  ModelManager,
  OpenAIAdapter,
  AnthropicAdapter
} from "../runtime/models";

export const runtimeModelsTests: any[] = [
  {
    name: "Model Registry: registers and lists models, finds cheapest",
    run: () => {
      const registry = new ModelRegistry();
      const models = registry.listModels();
      assert.ok(models.length >= 5);
      
      const gpt4 = registry.getModel("gpt-4o");
      assert.ok(gpt4);
      assert.equal(gpt4.provider, "openai");

      // Groq llama3 should be cheaper than gpt-4o for classification capability
      const cheapest = registry.getCheapestModel("classification");
      assert.ok(cheapest);
      assert.equal(cheapest.id, "llama3-70b-8192");
    }
  },
  {
    name: "Provider Registry: manages configurations and health states",
    run: () => {
      const registry = new ProviderRegistry();
      const config = { id: "test-provider", health: "Healthy" as const, status: "active" as const };
      const adapter = new OpenAIAdapter(config);
      
      registry.registerProvider(config, adapter);
      assert.equal(registry.getProviderConfig("test-provider")?.health, "Healthy");
      assert.ok(registry.getAdapter("test-provider"));

      registry.updateProviderHealth("test-provider", "Failed");
      assert.equal(registry.getProviderConfig("test-provider")?.health, "Failed");

      registry.updateProviderStatus("test-provider", "inactive");
      assert.equal(registry.getProviderConfig("test-provider")?.status, "inactive");
    }
  },
  {
    name: "Model Router: routes dynamically based on strategy configurations",
    run: () => {
      const registry = new ModelRegistry();
      const router = new ModelRouter(registry);

      const cheapestChat = router.route("chat", "cheapest");
      assert.ok(cheapestChat);

      const premiumChat = router.route("chat", "premium");
      assert.ok(premiumChat === "gpt-4o" || premiumChat === "claude-3-5-sonnet");
    }
  },
  {
    name: "Fallback Manager: sequences failover and skips unhealthy models",
    run: async () => {
      const fallback = new FallbackManager();
      fallback.registerFallbackChain("model-a", ["model-b", "model-c"]);

      const attempts: string[] = [];
      const result = await fallback.executeWithFailover(
        "model-a",
        async (id) => {
          attempts.push(id);
          if (id === "model-a") throw new Error("A failed");
          return "success-" + id;
        },
        (id) => id !== "model-b" // mock model-b as unavailable
      );

      assert.equal(result, "success-model-c");
      assert.deepEqual(attempts, ["model-a", "model-c"]);
    }
  },
  {
    name: "Model Health Monitor: tracks latencies, error rates and availability status",
    run: () => {
      const monitor = new ModelHealthMonitor();
      
      monitor.recordSuccess("model-1", 100);
      monitor.recordSuccess("model-1", 200);
      assert.equal(monitor.getAverageLatency("model-1"), 150);

      monitor.recordFailure("model-1");
      assert.equal(monitor.getErrorRate("model-1"), 1 / 3);
      assert.equal(monitor.isAvailable("model-1", 0.5), true);

      monitor.recordFailure("model-1");
      assert.equal(monitor.isAvailable("model-1", 0.5), false);
    }
  },
  {
    name: "Model Cost Manager: calculates input/output costs and blocks when budget exceeded",
    run: () => {
      const registry = new ModelRegistry();
      const costManager = new ModelCostManager(registry);

      costManager.setBudgetLimit(0.10);
      assert.equal(costManager.isBudgetExceeded(), false);

      // Record a low usage
      costManager.recordUsage("gpt-4o", 1000, 1000);
      // gpt-4o costs: input 0.005/1k, output 0.015/1k. Total cost = 0.005 + 0.015 = 0.02
      assert.equal(costManager.getTotalSpent(), 0.02);
      assert.equal(costManager.isBudgetExceeded(), false);

      // Record more usage to exceed budget
      costManager.recordUsage("gpt-4o", 5000, 5000); // 0.025 + 0.075 = 0.10. Total cost = 0.12 > 0.10
      assert.equal(costManager.isBudgetExceeded(), true);
    }
  },
  {
    name: "Model Manager: orchestrates execution and processes generate, embed and classify actions",
    run: async () => {
      const modelRegistry = new ModelRegistry();
      const providerRegistry = new ProviderRegistry();
      const healthMonitor = new ModelHealthMonitor();
      const router = new ModelRouter(modelRegistry, healthMonitor);
      const fallbackManager = new FallbackManager();
      const costManager = new ModelCostManager(modelRegistry);

      // Add dummy adapters
      providerRegistry.registerProvider({ id: "openai", health: "Healthy", status: "active" }, new OpenAIAdapter({ id: "openai", health: "Healthy", status: "active" }));
      providerRegistry.registerProvider({ id: "anthropic", health: "Healthy", status: "active" }, new AnthropicAdapter({ id: "anthropic", health: "Healthy", status: "active" }));

      const manager = new ModelManager(
        modelRegistry,
        providerRegistry,
        router,
        fallbackManager,
        healthMonitor,
        costManager
      );

      // Test generateCompletion (using mock testing adapter responses)
      const res1 = await manager.generateCompletion([{ role: "user", content: "hello" }], { model: "gpt-4o" });
      assert.equal(res1.model, "gpt-4o");
      assert.equal(res1.content, "Mock OpenAI Completion Response");
      assert.ok(costManager.getTotalSpent() > 0);

      // Test generate
      const res2 = await manager.generate("what is the intent?");
      assert.ok(res2.content);

      // Test embed
      const vec = await manager.embed("hello world", { model: "text-embedding-3-small" });
      assert.equal(vec.length, 1536);

      // Test classify
      const category = await manager.classify("Proceed with the payment details", ["Proceed", "Refund"]);
      assert.equal(category, "Proceed");
    }
  }
];
