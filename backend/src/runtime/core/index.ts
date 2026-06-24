// Re-export kernel services to preserve 100% backward compatibility
export * from "../kernel/diContainer";
export * from "../kernel/configManager";
export * from "../kernel/lifecycleManager";
export * from "../kernel/healthRegistry";
export * from "../kernel/stateManager";
export * from "../kernel/featureFlags";
export * from "../kernel/manifest";
export * from "../kernel/bootstrap";

// Export core module registries and engines
export * from "./moduleRegistry";
export * from "./capabilityRegistry";
export * from "./compatibilityMetadata";
export * from "../interfaces";
export { HealthStatus } from "../kernel/healthRegistry";
export * from "../communication";
export { EventCallback } from "../communication/eventBus";
