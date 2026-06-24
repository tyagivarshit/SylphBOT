import { CapabilityRegistry } from "../core/capabilityRegistry";
import { HealthRegistry } from "../kernel/healthRegistry";

export interface RouteResult {
  destinationOwner: string;
  priority: "high" | "medium" | "low";
  version: string;
}

export class RoutingEngine {
  private capabilityRegistry: CapabilityRegistry;
  private healthRegistry: HealthRegistry;
  private fallbackRoutes = new Map<string, string>(); // intent -> fallbackOwnerId

  constructor(capabilityRegistry: CapabilityRegistry, healthRegistry: HealthRegistry) {
    this.capabilityRegistry = capabilityRegistry;
    this.healthRegistry = healthRegistry;
  }

  /**
   * Set fallback owner ID for a specific intent/capability.
   */
  public registerFallback(intent: string, ownerId: string): void {
    this.fallbackRoutes.set(intent, ownerId);
  }

  /**
   * Route an intent based on registered capabilities and health states.
   */
  public route(intent: string, priority: "high" | "medium" | "low" = "medium"): RouteResult | null {
    // Look up capabilities that support this intent
    const capabilities = this.capabilityRegistry.discover({ name: intent, status: "Active" });
    if (capabilities.length === 0) {
      // Fall back if register fallback route exists
      const fallbackOwner = this.fallbackRoutes.get(intent);
      if (fallbackOwner) {
        console.log(`[Routing Engine] No active capabilities for [${intent}]. Using registered fallback: [${fallbackOwner}]`);
        return {
          destinationOwner: fallbackOwner,
          priority,
          version: "0.0.0"
        };
      }
      return null;
    }

    // Filter based on health status (avoid Unavailable capability owners)
    const healthyCap = capabilities.filter(cap => {
      const ownerHealth = this.healthRegistry.getHealth(cap.ownerId);
      return !ownerHealth || ownerHealth.health !== "Unavailable";
    });

    if (healthyCap.length === 0) {
      // If all are Unavailable, check if there is a Degraded option
      const degradedCap = capabilities.filter(cap => {
        const ownerHealth = this.healthRegistry.getHealth(cap.ownerId);
        return ownerHealth && ownerHealth.health === "Degraded";
      });

      if (degradedCap.length === 0) {
        // Fall back
        const fallbackOwner = this.fallbackRoutes.get(intent);
        if (fallbackOwner) {
          return { destinationOwner: fallbackOwner, priority, version: "0.0.0" };
        }
        return null;
      }

      // Pick the degraded one (first match)
      return {
        destinationOwner: degradedCap[0].ownerId,
        priority,
        version: degradedCap[0].version
      };
    }

    // Pick the healthiest matching capability (sort by health status, e.g. Healthy > Degraded)
    const sorted = [...healthyCap].sort((a, b) => {
      const hA = this.healthRegistry.getHealth(a.ownerId)?.health || "Healthy";
      const hB = this.healthRegistry.getHealth(b.ownerId)?.health || "Healthy";
      if (hA === "Healthy" && hB === "Degraded") return -1;
      if (hA === "Degraded" && hB === "Healthy") return 1;
      return 0;
    });

    return {
      destinationOwner: sorted[0].ownerId,
      priority,
      version: sorted[0].version
    };
  }

  /**
   * Reset fallback mappings (for tests).
   */
  public reset(): void {
    this.fallbackRoutes.clear();
  }
}
