export interface CompatibilityManifest {
  runtimeVersion: string;
  supportedRuntimeModules: string[];
  supportedExecutiveAiVersions: string[];
  supportedContractVersions: string[];
  supportedCapabilityVersions: string[];
  supportedSchemaVersions: string[];
}

export class CompatibilityEngine {
  private manifest: CompatibilityManifest;

  constructor(manifest?: CompatibilityManifest) {
    // Standard default configuration which can be loaded dynamically
    this.manifest = manifest || {
      runtimeVersion: "1.0.0",
      supportedRuntimeModules: [
        "runtime.kernel",
        "runtime.core",
        "runtime.communication",
        "runtime.memory",
        "runtime.eventbus"
      ],
      supportedExecutiveAiVersions: ["1.0.x", "1.1.x"],
      supportedContractVersions: ["1.0.0", "1.1.0"],
      supportedCapabilityVersions: ["1.0.0"],
      supportedSchemaVersions: ["1.0.0", "2.0.0"]
    };
  }

  /**
   * Check if a specific runtime module is supported.
   */
  public isModuleSupported(moduleName: string): boolean {
    return this.manifest.supportedRuntimeModules.includes(moduleName);
  }

  /**
   * Check if an Executive AI version matches supported range (simple semantic prefix match).
   */
  public isExecutiveAiVersionSupported(version: string): boolean {
    return this.matchVersion(version, this.manifest.supportedExecutiveAiVersions);
  }

  /**
   * Check if a contract version matches supported contract version list.
   */
  public isContractVersionSupported(version: string): boolean {
    return this.matchVersion(version, this.manifest.supportedContractVersions);
  }

  /**
   * Check if a capability version matches supported list.
   */
  public isCapabilityVersionSupported(version: string): boolean {
    return this.matchVersion(version, this.manifest.supportedCapabilityVersions);
  }

  /**
   * Check if a JSON schema version is supported.
   */
  public isSchemaVersionSupported(version: string): boolean {
    return this.matchVersion(version, this.manifest.supportedSchemaVersions);
  }

  /**
   * Get raw compatibility manifest.
   */
  public getManifest(): CompatibilityManifest {
    return { ...this.manifest };
  }

  private matchVersion(version: string, supportedRanges: string[]): boolean {
    for (const range of supportedRanges) {
      if (range === version) {
        return true;
      }
      
      // Simple Semantic Version Matching, e.g. "1.0.x" matches "1.0.5"
      if (range.endsWith(".x")) {
        const prefix = range.slice(0, -2);
        if (version.startsWith(prefix)) {
          return true;
        }
      }
    }
    return false;
  }
}
