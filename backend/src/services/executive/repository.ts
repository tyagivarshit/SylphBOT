import { IExecutiveDNA, IExecutiveIdentity, IExecutiveRepository } from "./interfaces";
import { DIContainer, container } from "../../runtime/kernel/diContainer";

export class MemoryExecutiveRepository implements IExecutiveRepository {
  private dnas = new Map<string, string>(); // role -> serialized DNA
  private executives = new Map<string, string>(); // tenantId:id -> serialized Executive

  constructor(private di: DIContainer = container) {}

  public getDNASync(role: string): IExecutiveDNA | null {
    const val = this.dnas.get(role);
    return val ? JSON.parse(val) : null;
  }

  public saveDNASync(dna: IExecutiveDNA): void {
    const serialized = JSON.stringify(dna);
    this.dnas.set(dna.role, serialized);
  }

  public async getDNA(role: string): Promise<IExecutiveDNA | null> {
    if (this.di.has("IMemoryEngine")) {
      const memoryEngine = this.di.resolve<any>("IMemoryEngine");
      try {
        const record = await memoryEngine.readMemory("system", "executive", `dna:${role}`);
        if (record && record.value) {
          this.dnas.set(role, record.value);
          return JSON.parse(record.value) as IExecutiveDNA;
        }
      } catch (err) {
        // Fallback to local map
      }
    }
    const val = this.dnas.get(role);
    return val ? JSON.parse(val) : null;
  }

  public async saveDNA(dna: IExecutiveDNA): Promise<void> {
    const serialized = JSON.stringify(dna);
    this.dnas.set(dna.role, serialized);

    if (this.di.has("IMemoryEngine")) {
      const memoryEngine = this.di.resolve<any>("IMemoryEngine");
      try {
        await memoryEngine.writeMemory("system", "executive", `dna:${dna.role}`, serialized);
      } catch (err) {
        // Fallback
      }
    }
  }

  public async getExecutive(tenantId: string, id: string): Promise<IExecutiveIdentity | null> {
    if (this.di.has("IMemoryEngine")) {
      const memoryEngine = this.di.resolve<any>("IMemoryEngine");
      try {
        // Try reading using specified tenantId
        const record = await memoryEngine.readMemory(tenantId, "executive", `exec:${id}`);
        if (record && record.value) {
          this.executives.set(id, record.value);
          const parsed = JSON.parse(record.value) as IExecutiveIdentity;
          if (parsed.tenantId !== tenantId) {
            throw new Error(`Cross-tenant Executive access blocked. Actor tenant [${tenantId}] does not match Executive tenant [${parsed.tenantId}].`);
          }
          return parsed;
        }
      } catch (err: any) {
        if (err.message && err.message.includes("Cross-tenant")) {
          throw err;
        }
      }
    }
    const val = this.executives.get(id);
    if (!val) return null;
    const parsed = JSON.parse(val) as IExecutiveIdentity;
    if (parsed.tenantId !== tenantId) {
      throw new Error(`Cross-tenant Executive access blocked. Actor tenant [${tenantId}] does not match Executive tenant [${parsed.tenantId}].`);
    }
    return parsed;
  }

  public async saveExecutive(executive: IExecutiveIdentity, expectedVersion?: number): Promise<IExecutiveIdentity> {
    // Fetch current version to perform optimistic concurrency check
    let currentVersion = 0;
    const existingStr = this.executives.get(executive.id);
    let existing: IExecutiveIdentity | null = null;
    
    if (existingStr) {
      existing = JSON.parse(existingStr) as IExecutiveIdentity;
      currentVersion = existing.version || 0;
    } else if (this.di.has("IMemoryEngine")) {
      const memoryEngine = this.di.resolve<any>("IMemoryEngine");
      try {
        const record = await memoryEngine.readMemory(executive.tenantId, "executive", `exec:${executive.id}`);
        if (record && record.value) {
          existing = JSON.parse(record.value) as IExecutiveIdentity;
          currentVersion = existing.version || 0;
        }
      } catch (err) {}
    }

    if (existing) {
      if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
        throw new Error(`Optimistic concurrency violation: version mismatch. Expected [${expectedVersion}] but got [${currentVersion}].`);
      }
      executive.version = currentVersion + 1;
    } else {
      executive.version = 1;
    }

    executive.updatedAt = new Date();
    const serialized = JSON.stringify(executive);
    this.executives.set(executive.id, serialized);

    if (this.di.has("IMemoryEngine")) {
      const memoryEngine = this.di.resolve<any>("IMemoryEngine");
      try {
        await memoryEngine.writeMemory(executive.tenantId, "executive", `exec:${executive.id}`, serialized);
      } catch (err) {}
    }

    return { ...executive };
  }

  public async listExecutives(tenantId: string): Promise<IExecutiveIdentity[]> {
    const list: IExecutiveIdentity[] = [];
    
    // Scan local map
    for (const value of this.executives.values()) {
      const parsed = JSON.parse(value) as IExecutiveIdentity;
      if (parsed.tenantId === tenantId) {
        list.push(parsed);
      }
    }
    
    // Deduplicate and merge if MemoryEngine is active
    if (this.di.has("IMemoryEngine")) {
      const memoryEngine = this.di.resolve<any>("IMemoryEngine");
      try {
        const records = await memoryEngine.searchMemory(tenantId, "executive", `exec:`);
        for (const record of records) {
          if (record.key.startsWith("exec:")) {
            const parsed = JSON.parse(record.value) as IExecutiveIdentity;
            if (parsed.tenantId === tenantId && !list.some(x => x.id === parsed.id)) {
              list.push(parsed);
            }
          }
        }
      } catch (err) {}
    }

    return list;
  }

  public async deleteExecutive(tenantId: string, id: string): Promise<void> {
    this.executives.delete(id);

    if (this.di.has("IMemoryEngine")) {
      const memoryEngine = this.di.resolve<any>("IMemoryEngine");
      try {
        await memoryEngine.writeMemory(tenantId, "executive", `exec:${id}`, "");
      } catch (err) {}
    }
  }

  public async clear(): Promise<void> {
    this.dnas.clear();
    this.executives.clear();
  }
}
