export type ServiceLifetime = "singleton" | "scoped" | "transient";

export interface ServiceRegistration {
  token: string;
  lifetime: ServiceLifetime;
  factory: (container: DIContainer) => any;
}

export class DIContainer {
  private parent?: DIContainer;
  private registrations = new Map<string, ServiceRegistration>();
  private singletons = new Map<string, any>();
  private scopedInstances = new Map<string, any>();
  private resolutionStack = new Set<string>();

  constructor(parent?: DIContainer) {
    this.parent = parent;
  }

  public register(token: string, lifetime: ServiceLifetime, factory: (container: DIContainer) => any): void {
    if (this.registrations.has(token)) {
      throw new Error(`Service [${token}] is already registered in this container.`);
    }
    this.registrations.set(token, { token, lifetime, factory });
  }

  public registerSingleton(token: string, factory: (container: DIContainer) => any): void {
    this.register(token, "singleton", factory);
  }

  public registerScoped(token: string, factory: (container: DIContainer) => any): void {
    this.register(token, "scoped", factory);
  }

  public registerTransient(token: string, factory: (container: DIContainer) => any): void {
    this.register(token, "transient", factory);
  }

  public registerInstance(token: string, instance: any): void {
    if (this.registrations.has(token)) {
      throw new Error(`Service [${token}] is already registered in this container.`);
    }
    this.registrations.set(token, {
      token,
      lifetime: "singleton",
      factory: () => instance
    });
    this.singletons.set(token, instance);
  }

  public createScope(): DIContainer {
    return new DIContainer(this);
  }

  public resolve<T>(token: string): T {
    if (this.resolutionStack.has(token)) {
      const path = Array.from(this.resolutionStack).join(" -> ") + " -> " + token;
      throw new Error(`Circular dependency detected during resolution of [${token}]: ${path}`);
    }

    this.resolutionStack.add(token);

    try {
      const registration = this.findRegistration(token);
      if (!registration) {
        throw new Error(`No registration found for service token: [${token}]`);
      }

      switch (registration.lifetime) {
        case "singleton":
          return this.resolveSingleton(registration);
        case "scoped":
          return this.resolveScoped(registration);
        case "transient":
          return registration.factory(this);
        default:
          throw new Error(`Unsupported service lifetime: ${registration.lifetime}`);
      }
    } finally {
      this.resolutionStack.delete(token);
    }
  }

  public has(token: string): boolean {
    return this.registrations.has(token) || (this.parent ? this.parent.has(token) : false);
  }

  public reset(): void {
    this.singletons.clear();
    this.scopedInstances.clear();
    this.registrations.clear();
  }

  private findRegistration(token: string): ServiceRegistration | undefined {
    const reg = this.registrations.get(token);
    if (reg) {
      return reg;
    }
    return this.parent?.findRegistration(token);
  }

  private resolveSingleton(registration: ServiceRegistration): any {
    if (this.parent) {
      return this.parent.resolveSingleton(registration);
    }

    if (!this.singletons.has(registration.token)) {
      const instance = registration.factory(this);
      this.singletons.set(registration.token, instance);
    }
    return this.singletons.get(registration.token);
  }

  private resolveScoped(registration: ServiceRegistration): any {
    if (!this.parent) {
      return this.resolveSingleton(registration);
    }

    if (!this.scopedInstances.has(registration.token)) {
      const instance = registration.factory(this);
      this.scopedInstances.set(registration.token, instance);
    }
    return this.scopedInstances.get(registration.token);
  }
}

export const container = new DIContainer();
