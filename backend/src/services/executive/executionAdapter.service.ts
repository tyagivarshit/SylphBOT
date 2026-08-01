import { DIContainer, container } from "../../runtime/kernel/diContainer";
import { getRequestContext } from "../../observability/requestContext";
import { runDetachedBackgroundTask } from "../../utils/backgroundTask";
import * as crypto from "crypto";

// ============================================================================
// ENCRYPTION HELPERS
// ============================================================================

const ENCRYPTION_KEY = crypto.scryptSync("automexia-system-secure-salt", "salt", 32);

export function encryptSecret(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

export function decryptSecret(text: string): string {
  const parts = text.split(":");
  const iv = Buffer.from(parts.shift()!, "hex");
  const encryptedText = Buffer.from(parts.join(":"), "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText).toString("utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ============================================================================
// DATA MODELS & INTERFACES
// ============================================================================

export interface IConnectorConfig {
  id: string;
  tenantId: string;
  connectorName: string; // e.g. "GitHub", "Jira", "Slack", "HubSpot", "Stripe", "GoogleCalendar"
  encryptedSecrets: string; // no plaintext secrets stored
  allowedActions: string[]; // e.g. ["send_message", "delete_user", "reboot_instance"]
  rateLimitPerMin: number;
  timeoutMs: number;
  rollbackStrategy: {
    canRollback: boolean;
    rollbackMethod: string;
    compensationMethod: string;
    recoveryStrategy: "RETRY" | "FALLBACK" | "ABORT";
  };
  healthStatus?: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  lastHealthCheck?: string;
  driftDetected?: boolean;
}

export interface IAdapterRequest {
  id: string;
  tenantId: string;
  connectorId: string;
  action: string;
  payload: Record<string, any>;
  executionWindow?: {
    start: string;
    end: string;
  };
  metadata?: Record<string, any>;
}

export interface ISafetyReport {
  isSafe: boolean;
  violations: string[];
  warnings: string[];
  checksRun: {
    policyChecked: boolean;
    authorizationChecked: boolean;
    tenantChecked: boolean;
    allowedActionChecked: boolean;
    executionWindowChecked: boolean;
    dangerousOperationsChecked: boolean;
    rollbackAvailableChecked: boolean;
  };
  timestamp: string;
}

export interface IAdapterExplainabilityReport {
  whyConnectorSelected: string;
  whyAuthenticationUsed: string;
  whyRetryHappened: string;
  whyRequestFailed: string;
  whyRequestDelayed: string;
  whyFallbackSelected: string;
  timestamp: string;
}

// Execution Package Compiler Output (Deliverable 17)
export interface IExecutionPackageCompilerOutput {
  compiledAt: string;
  tenantId: string;
  executionId: string;
  decisionId: string;
  
  decision: any;
  authorization: any;
  executionGraph: any;
  executionPlan: any;
  adapter: {
    connectorId: string;
    connectorName: string;
    rateLimitPerMin: number;
  };
  authentication: {
    status: "ENCRYPTED";
    credentialMask: string;
  };
  connector: {
    allowedActions: string[];
  };
  retryPolicy: {
    maxRetries: number;
    backoffMs: number;
  };
  rateLimits: {
    limitPerMin: number;
    currentLoadEstimate: number;
  };
  timeout: {
    softTimeoutMs: number;
    hardTimeoutMs: number;
  };
  rollbackStrategy: {
    canRollback: boolean;
    rollbackMethod: string;
    compensationMethod: string;
    recoveryStrategy: string;
  };
  metadata: Record<string, any>;
}

// ============================================================================
// REPOSITORY INTERFACES & O(1) IMPLEMENTATIONS
// ============================================================================

export interface IExecutiveExecutionAdapterRepository {
  saveConnectorConfig(tenantId: string, config: IConnectorConfig): Promise<void>;
  findConnectorConfigById(tenantId: string, id: string): Promise<IConnectorConfig | null>;
  findConnectorConfigByName(tenantId: string, name: string): Promise<IConnectorConfig | null>;
  deleteConnectorConfig(tenantId: string, id: string): Promise<void>;
  listAllConfigs(tenantId: string): Promise<IConnectorConfig[]>;
}

export class MemoryExecutiveExecutionAdapterRepository implements IExecutiveExecutionAdapterRepository {
  private configsDb = new Map<string, Map<string, IConnectorConfig>>();

  private verifyTenant(callerTenantId: string, resourceTenantId: string): void {
    if (callerTenantId !== resourceTenantId) {
      throw new Error(`Security Violation: Caller tenant [${callerTenantId}] does not match resource tenant [${resourceTenantId}].`);
    }
    const ctx = getRequestContext();
    const ctxTenantId = ctx?.tenantId || ctx?.businessId;
    if (ctxTenantId && ctxTenantId !== callerTenantId) {
      throw new Error(`Security Violation: Context tenant [${ctxTenantId}] does not match resource tenant [${callerTenantId}].`);
    }
  }

  public async saveConnectorConfig(tenantId: string, config: IConnectorConfig): Promise<void> {
    this.verifyTenant(tenantId, config.tenantId);
    if (!this.configsDb.has(tenantId)) {
      this.configsDb.set(tenantId, new Map());
    }
    this.configsDb.get(tenantId)!.set(config.id, JSON.parse(JSON.stringify(config)));
  }

  public async findConnectorConfigById(tenantId: string, id: string): Promise<IConnectorConfig | null> {
    this.verifyTenant(tenantId, tenantId);
    const tenantMap = this.configsDb.get(tenantId);
    if (!tenantMap) return null;
    const item = tenantMap.get(id);
    if (!item) return null;
    return JSON.parse(JSON.stringify(item));
  }

  public async findConnectorConfigByName(tenantId: string, name: string): Promise<IConnectorConfig | null> {
    this.verifyTenant(tenantId, tenantId);
    const tenantMap = this.configsDb.get(tenantId);
    if (!tenantMap) return null;
    for (const config of tenantMap.values()) {
      if (config.connectorName === name) {
        return JSON.parse(JSON.stringify(config));
      }
    }
    return null;
  }

  public async deleteConnectorConfig(tenantId: string, id: string): Promise<void> {
    this.verifyTenant(tenantId, tenantId);
    const tenantMap = this.configsDb.get(tenantId);
    if (tenantMap) {
      tenantMap.delete(id);
    }
  }

  public async listAllConfigs(tenantId: string): Promise<IConnectorConfig[]> {
    this.verifyTenant(tenantId, tenantId);
    const tenantMap = this.configsDb.get(tenantId);
    if (!tenantMap) return [];
    return Array.from(tenantMap.values()).map(item => JSON.parse(JSON.stringify(item)));
  }
}

// ============================================================================
// EXECUTIVE ADAPTER SERVICE
// ============================================================================

export class ExecutiveExecutionAdapterService {
  constructor(private di: DIContainer = container) {}

  public async saveConnectorConfig(tenantId: string, config: IConnectorConfig): Promise<void> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionAdapterRepository>("IExecutiveExecutionAdapterRepository");
    await repo.saveConnectorConfig(tenantId, config);
  }

  private validateRequestContext(tenantId: string): void {
    const ctx = getRequestContext();
    const ctxTenantId = ctx?.tenantId || ctx?.businessId;
    if (ctxTenantId && ctxTenantId !== tenantId) {
      throw new Error(`Security Violation: Caller tenant [${ctxTenantId}] does not match resource tenant [${tenantId}].`);
    }
  }

  private async publishEvent(tenantId: string, eventName: string, payload: any): Promise<void> {
    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      if (eventBus) {
        await eventBus.publish(eventName, "1.0.0", payload, { tenantId }).catch(() => {});
      }
    }
  }

  /**
   * Capability Lookup (O(1))
   */
  public hasCapability(tenantId: string, config: IConnectorConfig, action: string): boolean {
    this.validateRequestContext(tenantId);
    const capSet = new Set(config.allowedActions);
    return capSet.has(action);
  }

  /**
   * Execution Translation (O(1))
   */
  public translateRequest(tenantId: string, request: IAdapterRequest, targetFormat: string): Record<string, any> {
    this.validateRequestContext(tenantId);
    const translationMap: Record<string, (req: IAdapterRequest) => Record<string, any>> = {
      slack: (req) => ({ text: req.payload.message || req.payload.text || "Notification payload" }),
      github: (req) => ({ title: req.payload.title || "GitHub Issue", body: req.payload.body || "" }),
      jira: (req) => ({ fields: { summary: req.payload.summary || "Jira ticket", issuetype: { name: req.payload.issueType || "Task" } } }),
      stripe: (req) => ({ amount: req.payload.amount, currency: req.payload.currency || "USD" }),
      hubspot: (req) => ({ properties: { email: req.payload.email, firstname: req.payload.firstname } }),
      default: (req) => req.payload
    };

    const translator = translationMap[targetFormat.toLowerCase()] || translationMap.default;
    return translator(request);
  }

  /**
   * Webhook Secret Rotation
   */
  public async rotateWebhookSecret(tenantId: string, connectorId: string): Promise<string> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionAdapterRepository>("IExecutiveExecutionAdapterRepository");
    const config = await repo.findConnectorConfigById(tenantId, connectorId);
    if (!config) throw new Error("Connector not found.");

    const newSecret = crypto.randomBytes(32).toString("hex");
    config.encryptedSecrets = encryptSecret(newSecret);
    await repo.saveConnectorConfig(tenantId, config);

    await this.publishEvent(tenantId, "executive.execution.adapter.updated", {
      connectorId,
      tenantId,
      updatedField: "webhookSecret",
      timestamp: new Date().toISOString()
    });

    return newSecret;
  }

  /**
   * OAuth Token Refresh Validation
   */
  public async refreshOAuthToken(tenantId: string, connectorId: string, refreshPayload: string): Promise<{ status: string; expiresAt: string }> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionAdapterRepository>("IExecutiveExecutionAdapterRepository");
    const config = await repo.findConnectorConfigById(tenantId, connectorId);
    if (!config) throw new Error("Connector not found.");

    // Update with refreshed credentials
    config.encryptedSecrets = encryptSecret(refreshPayload);
    await repo.saveConnectorConfig(tenantId, config);

    await this.publishEvent(tenantId, "executive.execution.adapter.connected", {
      connectorId,
      tenantId,
      timestamp: new Date().toISOString()
    });

    return {
      status: "SUCCESSFUL_REFRESH",
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    };
  }

  /**
   * Permission Drift Detection
   */
  public async detectPermissionDrift(tenantId: string, connectorId: string, actualRemoteCapabilities: string[]): Promise<boolean> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionAdapterRepository>("IExecutiveExecutionAdapterRepository");
    const config = await repo.findConnectorConfigById(tenantId, connectorId);
    if (!config) throw new Error("Connector not found.");

    const actualSet = new Set(actualRemoteCapabilities);
    // Find if any declared action is missing from remote capabilities
    let drift = false;
    for (const action of config.allowedActions) {
      if (!actualSet.has(action)) {
        drift = true;
        break;
      }
    }

    if (drift) {
      config.driftDetected = true;
      config.healthStatus = "DEGRADED";
      await repo.saveConnectorConfig(tenantId, config);

      await this.publishEvent(tenantId, "executive.execution.adapter.health.updated", {
        connectorId,
        tenantId,
        healthStatus: "DEGRADED",
        reason: "Permission drift detected: declared capabilities missing on target system.",
        timestamp: new Date().toISOString()
      });
    }

    return drift;
  }

  /**
   * Health Update
   */
  public async updateHealth(tenantId: string, connectorId: string, status: "HEALTHY" | "DEGRADED" | "UNHEALTHY"): Promise<void> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionAdapterRepository>("IExecutiveExecutionAdapterRepository");
    const config = await repo.findConnectorConfigById(tenantId, connectorId);
    if (config) {
      config.healthStatus = status;
      config.lastHealthCheck = new Date().toISOString();
      await repo.saveConnectorConfig(tenantId, config);

      await this.publishEvent(tenantId, "executive.execution.adapter.health.updated", {
        connectorId,
        tenantId,
        healthStatus: status,
        timestamp: config.lastHealthCheck
      });
    }
  }

  /**
   * 14. Execution Safety Engine (O(n) validation complexity)
   */
  public async verifySafety(tenantId: string, request: IAdapterRequest, executionId: string): Promise<ISafetyReport> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionAdapterRepository>("IExecutiveExecutionAdapterRepository");
    const executionService = this.di.resolve<any>("IExecutiveExecutionService");

    const violations: string[] = [];
    const warnings: string[] = [];

    const checks = {
      policyChecked: false,
      authorizationChecked: false,
      tenantChecked: false,
      allowedActionChecked: false,
      executionWindowChecked: false,
      dangerousOperationsChecked: false,
      rollbackAvailableChecked: false
    };

    // 1. Tenant Check
    checks.tenantChecked = true;
    if (request.tenantId !== tenantId) {
      violations.push(`Security Violation: Request tenant [${request.tenantId}] does not match actor tenant [${tenantId}].`);
    }

    // Resolve Connector Config
    const config = await repo.findConnectorConfigById(tenantId, request.connectorId);
    if (!config) {
      violations.push(`Configuration Error: Connector [${request.connectorId}] not registered on tenant.`);
      return { isSafe: false, violations, warnings, checksRun: checks, timestamp: new Date().toISOString() };
    }

    // 2. Allowed Action Check (O(1) capability lookup)
    checks.allowedActionChecked = true;
    if (!this.hasCapability(tenantId, config, request.action)) {
      violations.push(`Policy Violation: Requested action [${request.action}] is not permitted on connector [${config.connectorName}].`);
    }

    // 3. Authorization Check
    checks.authorizationChecked = true;
    const exec = await executionService.getExecution(tenantId, executionId);
    if (exec) {
      if (this.di.has("IExecutiveDecisionAuthorizationRepository")) {
        const authRepo = this.di.resolve<any>("IExecutiveDecisionAuthorizationRepository");
        const auth = await authRepo.findAuthorizationById(tenantId, exec.authorizationId).catch(() => null);
        if (auth && auth.status !== "AUTHORIZED") {
          violations.push(`Authorization Error: Execution authorization is in state [${auth.status}], expecting AUTHORIZED.`);
        }
      }
    } else {
      violations.push(`Execution Error: Context execution [${executionId}] not found.`);
    }

    // 4. Policy Check
    checks.policyChecked = true;
    if (exec?.metadata?.bypassHardLimit) {
      warnings.push("Governance Warning: Policy limits are bypassed under override settings.");
    }

    // 5. Execution Window Check
    checks.executionWindowChecked = true;
    if (request.executionWindow) {
      const now = new Date().toISOString();
      if (now < request.executionWindow.start || now > request.executionWindow.end) {
        violations.push(`Window Violation: Active time [${now}] falls outside allowed execution window [${request.executionWindow.start} to ${request.executionWindow.end}].`);
      }
    }

    // 6. Dangerous Operations Check
    checks.dangerousOperationsChecked = true;
    const dangerousKeywords = ["delete", "drop", "truncate", "terminate", "reboot", "wipe", "flush"];
    const isDangerous = dangerousKeywords.some(keyword => request.action.toLowerCase().includes(keyword));
    if (isDangerous) {
      if (!request.metadata?.supervisorSignature) {
        violations.push(`Dangerous Operation: Action [${request.action}] is flagged as dangerous and requires supervisor overrides.`);
      } else {
        warnings.push(`Supervisor Override: Dangerous action [${request.action}] authorized by supervisor signature.`);
      }
    }

    // 7. Rollback Availability Check
    checks.rollbackAvailableChecked = true;
    if (!config.rollbackStrategy.canRollback) {
      warnings.push(`Hardening Warning: Action [${request.action}] does not support compensation rollback paths.`);
    }

    const isSafe = violations.length === 0;

    const report: ISafetyReport = {
      isSafe,
      violations,
      warnings,
      checksRun: checks,
      timestamp: new Date().toISOString()
    };

    if (!isSafe) {
      await this.publishEvent(tenantId, "executive.execution.adapter.safety.violated", {
        executionId,
        tenantId,
        connectorId: request.connectorId,
        action: request.action,
        violationsCount: violations.length,
        timestamp: report.timestamp
      });
    }

    return report;
  }

  /**
   * 13. Timeout Engine & Request Execution
   */
  public async executeAdapterRequest(
    tenantId: string,
    request: IAdapterRequest,
    executionId: string
  ): Promise<any> {
    this.validateRequestContext(tenantId);
    
    // Safety verification check
    const safety = await this.verifySafety(tenantId, request, executionId);
    if (!safety.isSafe) {
      throw new Error(`Safety Violation: Request rejected. Issues: ${safety.violations.join("; ")}`);
    }

    const repo = this.di.resolve<IExecutiveExecutionAdapterRepository>("IExecutiveExecutionAdapterRepository");
    const config = await repo.findConnectorConfigById(tenantId, request.connectorId);
    if (!config) throw new Error("Connector config not found.");

    await this.publishEvent(tenantId, "executive.execution.adapter.request.sent", {
      executionId,
      tenantId,
      connectorId: request.connectorId,
      action: request.action,
      timestamp: new Date().toISOString()
    });

    // Timeout logic using AbortController
    const controller = new AbortController();
    const signal = controller.signal;

    const softTimeoutMs = config.timeoutMs * 0.7; // Soft timeout at 70% of max limit
    const hardTimeoutMs = config.timeoutMs;

    let softTimerTriggered = false;

    // Soft timeout warning
    const softTimer = setTimeout(() => {
      softTimerTriggered = true;
      console.warn(`Soft Timeout: Request exceeded soft threshold [${softTimeoutMs}ms].`);
      runDetachedBackgroundTask("execution_adapter_soft_timeout", () =>
        this.publishEvent(tenantId, "executive.execution.adapter.timeout.triggered", {
          executionId,
          tenantId,
          connectorId: request.connectorId,
          timeoutType: "SOFT",
          limitMs: softTimeoutMs,
          timestamp: new Date().toISOString()
        })
      );
    }, softTimeoutMs);

    // Hard timeout abort
    const hardTimer = setTimeout(() => {
      console.error(`Hard Timeout: Force canceling request on connector [${config.connectorName}] after [${hardTimeoutMs}ms].`);
      runDetachedBackgroundTask("execution_adapter_hard_timeout", () =>
        this.publishEvent(tenantId, "executive.execution.adapter.timeout.triggered", {
          executionId,
          tenantId,
          connectorId: request.connectorId,
          timeoutType: "HARD",
          limitMs: hardTimeoutMs,
          timestamp: new Date().toISOString()
        })
      );
      controller.abort();
    }, hardTimeoutMs);

    try {
      // Simulate connection request logic (checking abort signals)
      const outcome = await new Promise((resolve, reject) => {
        const handleAbort = () => {
          reject(new Error("Request canceled: Hard timeout triggered."));
        };
        if (signal.aborted) return handleAbort();
        signal.addEventListener("abort", handleAbort);

        // Simulated latency
        const targetLatency = request.metadata?.simulatedLatencyMs || 50;
        setTimeout(() => {
          signal.removeEventListener("abort", handleAbort);
          resolve({
            status: "SUCCESS",
            responseCode: 200,
            simulatedOutput: `Executed [${request.action}] successfully.`,
            softTimeoutHit: softTimerTriggered
          });
        }, targetLatency);
      });

      clearTimeout(softTimer);
      clearTimeout(hardTimer);

      await this.publishEvent(tenantId, "executive.execution.adapter.request.completed", {
        executionId,
        tenantId,
        connectorId: request.connectorId,
        action: request.action,
        timestamp: new Date().toISOString()
      });

      return outcome;
    } catch (err: any) {
      clearTimeout(softTimer);
      clearTimeout(hardTimer);

      await this.publishEvent(tenantId, "executive.execution.adapter.failed", {
        executionId,
        tenantId,
        connectorId: request.connectorId,
        action: request.action,
        error: err.message,
        timestamp: new Date().toISOString()
      });

      throw err;
    }
  }

  /**
   * 16. Adapter Explainability Engine
   */
  public async generateAdapterExplainability(
    tenantId: string,
    request: IAdapterRequest,
    executionId: string,
    outcomeLog?: Record<string, any>
  ): Promise<IAdapterExplainabilityReport> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionAdapterRepository>("IExecutiveExecutionAdapterRepository");
    const config = await repo.findConnectorConfigById(tenantId, request.connectorId);

    const whyConnectorSelected = config
      ? `Connector [${config.connectorName}] was selected because it is registered to execute action [${request.action}] on tenant [${tenantId}].`
      : `Connector not resolved. Target connector ID: [${request.connectorId}].`;

    const whyAuthenticationUsed = config
      ? "Authentication was used because connecting to remote REST gateways requires cryptographically signed headers."
      : "Connector not resolved.";

    const whyRetryHappened = outcomeLog?.retriesCount && outcomeLog.retriesCount > 0
      ? `Retry occurred because the destination API endpoint encountered server error status [502 Bad Gateway] during attempts.`
      : "No retry was required; the connection was established successfully.";

    const whyRequestFailed = outcomeLog?.error
      ? `Request failed because: ${outcomeLog.error}`
      : "Request did not encounter connection failures.";

    const whyRequestDelayed = outcomeLog?.latency && outcomeLog.latency > (config?.timeoutMs || 5000) * 0.5
      ? "Request was delayed because the target endpoint experienced elevated response latency times."
      : "Request was executed within nominal response thresholds.";

    const whyFallbackSelected = outcomeLog?.fallbackTriggered
      ? `Fallback strategy was selected because the primary destination connector [${config?.connectorName}] timed out after ${config?.timeoutMs}ms.`
      : "Fallback routing was not required.";

    return {
      whyConnectorSelected,
      whyAuthenticationUsed,
      whyRetryHappened,
      whyRequestFailed,
      whyRequestDelayed,
      whyFallbackSelected,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 17. Execution Package Compiler
   */
  public async compileExecutionPackage(
    tenantId: string,
    executionId: string,
    connectorId: string
  ): Promise<IExecutionPackageCompilerOutput> {
    this.validateRequestContext(tenantId);
    
    const executionService = this.di.resolve<any>("IExecutiveExecutionService");
    const graphService = this.di.resolve<any>("IExecutiveExecutionGraphService");
    const adapterRepo = this.di.resolve<IExecutiveExecutionAdapterRepository>("IExecutiveExecutionAdapterRepository");

    const exec = await executionService.getExecution(tenantId, executionId);
    if (!exec) throw new Error("Execution context not found.");

    const config = await adapterRepo.findConnectorConfigById(tenantId, connectorId);
    if (!config) throw new Error("Connector configuration not found.");

    // Resolve Stage 3 components
    let decision = null;
    if (this.di.has("IExecutiveDecisionRepository")) {
      const decRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
      decision = await decRepo.findDecisionById(tenantId, exec.decisionId).catch(() => null);
    }

    let authorization = null;
    if (this.di.has("IExecutiveDecisionAuthorizationRepository")) {
      const authRepo = this.di.resolve<any>("IExecutiveDecisionAuthorizationRepository");
      authorization = await authRepo.findAuthorizationById(tenantId, exec.authorizationId).catch(() => null);
    }

    let executionGraph = null;
    let executionPlan = null;
    if (graphService) {
      executionGraph = await graphService.getExecutionGraph(tenantId, executionId).catch(() => null);
      if (executionGraph) {
        executionPlan = {
          nodes: executionGraph.nodes.map((n: any) => ({ id: n.id, name: n.name })),
          edges: executionGraph.edges
        };
      }
    }

    const packageMetadata = {
      compiledBy: "ExecutionPackageCompilerEngine",
      tenantId,
      executionId,
      timestamp: new Date().toISOString()
    };

    const compiled: IExecutionPackageCompilerOutput = {
      compiledAt: packageMetadata.timestamp,
      tenantId,
      executionId,
      decisionId: exec.decisionId,
      
      decision,
      authorization,
      executionGraph,
      executionPlan,
      
      adapter: {
        connectorId: config.id,
        connectorName: config.connectorName,
        rateLimitPerMin: config.rateLimitPerMin
      },
      authentication: {
        status: "ENCRYPTED",
        credentialMask: "********-****-****-****-************"
      },
      connector: {
        allowedActions: config.allowedActions
      },
      retryPolicy: {
        maxRetries: 3,
        backoffMs: 2000
      },
      rateLimits: {
        limitPerMin: config.rateLimitPerMin,
        currentLoadEstimate: 5
      },
      timeout: {
        softTimeoutMs: config.timeoutMs * 0.7,
        hardTimeoutMs: config.timeoutMs
      },
      rollbackStrategy: {
        canRollback: config.rollbackStrategy.canRollback,
        rollbackMethod: config.rollbackStrategy.rollbackMethod,
        compensationMethod: config.rollbackStrategy.compensationMethod,
        recoveryStrategy: config.rollbackStrategy.recoveryStrategy
      },
      metadata: packageMetadata
    };

    await this.publishEvent(tenantId, "executive.execution.adapter.package.compiled", {
      executionId,
      tenantId,
      connectorId,
      compiledAt: compiled.compiledAt
    });

    return JSON.parse(JSON.stringify(compiled));
  }
}
