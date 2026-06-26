import { container } from "../kernel/diContainer";
import { CompatibilityEngine } from "../core/compatibilityMetadata";

export interface EventContract {
  name: string;
  version: string;
  schema: Record<string, "string" | "number" | "boolean" | "object" | "array">;
  compatibilityRules?: "backward" | "forward" | "full";
  isDeprecated?: boolean;
  deprecationDate?: Date;
}

export class ContractRegistry {
  private contracts = new Map<string, EventContract>();

  /**
   * Register a new schema contract.
   */
  public registerContract(contract: EventContract): void {
    const key = `${contract.name}:${contract.version}`;
    
    if (this.contracts.has(key)) {
      const existing = this.contracts.get(key)!;
      const existingSchemaStr = JSON.stringify(existing.schema);
      const newSchemaStr = JSON.stringify(contract.schema);
      
      if (existingSchemaStr === newSchemaStr) {
        console.warn(`[Contract Registry] Idempotent registration: Contract [${contract.name}] v[${contract.version}] already registered with identical schema. Reusing existing.`);
        return;
      } else {
        throw new Error(`Contract [${contract.name}] version [${contract.version}] is already registered with a different schema. Duplicate registration rejected.`);
      }
    }

    const compEngine = container.has("ICompatibilityEngine")
      ? container.resolve<CompatibilityEngine>("ICompatibilityEngine")
      : new CompatibilityEngine();

    if (!compEngine.isContractVersionSupported(contract.version)) {
      throw new Error(`Contract [${contract.name}] version [${contract.version}] is not supported by CompatibilityEngine.`);
    }

    // Compatibility check for new versions if other versions exist
    const otherVersions = Array.from(this.contracts.values()).filter(c => c.name === contract.name);
    if (otherVersions.length > 0) {
      // Check schema compatibility against existing versions
      for (const other of otherVersions) {
        const isCompatible = this.checkSchemaCompatibility(other, contract);
        if (!isCompatible) {
          throw new Error(`Contract [${contract.name}] v[${contract.version}] is incompatible with existing version [${other.version}].`);
        }
      }
    }

    this.contracts.set(key, { ...contract });
    console.log(`[Contract Registry] Registered contract for [${contract.name}] v[${contract.version}]`);
  }

  /**
   * Fetch a registered contract.
   */
  public getContract(name: string, version: string): EventContract | null {
    return this.contracts.get(`${name}:${version}`) || null;
  }

  /**
   * Validate a payload against the contract's type schema.
   */
  public validateEvent(name: string, version: string, payload: any): { isValid: boolean; errors: string[] } {
    const contract = this.getContract(name, version);
    if (!contract) {
      return { isValid: false, errors: [`Contract [${name}] v[${version}] not found in registry.`] };
    }

    if (contract.isDeprecated) {
      console.warn(`[Contract Registry] WARNING: Contract [${name}] v[${version}] is deprecated.`);
    }

    const errors: string[] = [];

    // Simple type-checking schema validator
    for (const [key, expectedType] of Object.entries(contract.schema)) {
      const val = payload[key];
      if (val === undefined || val === null) {
        errors.push(`Missing required field: [${key}]`);
        continue;
      }

      const actualType = typeof val;
      if (expectedType === "array") {
        if (!Array.isArray(val)) {
          errors.push(`Field [${key}] expected to be array, got: ${actualType}`);
        }
      } else if (expectedType === "object") {
        if (actualType !== "object" || Array.isArray(val)) {
          errors.push(`Field [${key}] expected to be object, got: ${actualType}`);
        }
      } else {
        if (actualType !== expectedType) {
          errors.push(`Field [${key}] expected to be ${expectedType}, got: ${actualType}`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Assess if schemas are compatible (e.g. backward compatible: no fields are removed).
   */
  public checkCompatibility(name: string, oldVersion: string, newVersion: string): boolean {
    const oldContract = this.getContract(name, oldVersion);
    const newContract = this.getContract(name, newVersion);

    if (!oldContract || !newContract) {
      return false;
    }

    return this.checkSchemaCompatibility(oldContract, newContract);
  }

  /**
   * Reset contracts (for tests).
   */
  public reset(): void {
    this.contracts.clear();
  }

  private checkSchemaCompatibility(oldContract: EventContract, newContract: EventContract): boolean {
    // Backward compatibility rule: new schema must contain all fields of the old schema with the same types
    for (const [key, oldType] of Object.entries(oldContract.schema)) {
      const newType = newContract.schema[key];
      if (!newType || newType !== oldType) {
        return false;
      }
    }
    return true;
  }
}

