import { DecisionMetadata } from "./interfaces";
import { IOrganizationIntelligenceGraph } from "../oig/interfaces";

function redactPII(properties: Record<string, any>): Record<string, any> {
  if (!properties) return {};
  const redacted = { ...properties };
  const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const PHONE_REGEX = /(\+?\d{1,4}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

  for (const [key, value] of Object.entries(redacted)) {
    if (typeof value === "string") {
      let temp = value;
      temp = temp.replace(EMAIL_REGEX, "[REDACTED_EMAIL]");
      temp = temp.replace(PHONE_REGEX, "[REDACTED_PHONE]");
      redacted[key] = temp;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      redacted[key] = redactPII(value);
    }
  }
  return redacted;
}

export class DecisionMetadataEngine {
  private decisions = new Map<string, DecisionMetadata>();
  private graph: IOrganizationIntelligenceGraph;

  constructor(graph: IOrganizationIntelligenceGraph) {
    this.graph = graph;
  }

  // ==========================================
  // DECISION METADATA ENGINE (Phase 7)
  // ==========================================

  public storeDecision(metadata: Omit<DecisionMetadata, "timestamp">): DecisionMetadata {
    // Redact validation results and audit metadata to remain privacy-safe
    const sanitizedValidationResults = metadata.validationResults ? redactPII(metadata.validationResults) : undefined;
    const sanitizedAuditMetadata = metadata.auditMetadata ? redactPII(metadata.auditMetadata) : undefined;

    const fullDecision: DecisionMetadata = {
      ...metadata,
      timestamp: new Date(),
      validationResults: sanitizedValidationResults,
      auditMetadata: sanitizedAuditMetadata
    };

    this.decisions.set(metadata.decisionId, fullDecision);

    // Record decision count in graph observability
    if (typeof (this.graph as any).recordTelemetryMetric === "function") {
      (this.graph as any).recordTelemetryMetric("decisionMetadataCreationCount", 1);
    }

    // Also project decision into OIG as a Knowledge node for unified lookup
    try {
      const tenantId = metadata.tenantId;
      const ctx = { tenantId, actorId: "decision_engine", scopes: ["oig:write"] };
      
      this.graph.addSecureNode({
        id: `decision_${metadata.decisionId}`,
        type: "Knowledge",
        properties: {
          category: "decision_metadata",
          confidenceScore: metadata.confidenceScore || 1.0,
          traceCount: metadata.executionTrace?.length || 0,
          timestamp: fullDecision.timestamp
        },
        tenantId,
        evidenceReferences: metadata.evidenceReferences,
        sourceReferences: metadata.sourceReferences,
        policyReferences: metadata.policyReferences,
        capabilityReferences: metadata.capabilityReferences,
        workflowReferences: metadata.workflowReferences,
        confidenceScore: metadata.confidenceScore,
        executionTrace: metadata.executionTrace,
        validationResults: sanitizedValidationResults,
        approvalReferences: metadata.approvalReferences,
        auditMetadata: sanitizedAuditMetadata
      }, ctx);
    } catch (err) {
      // Safe to ignore if graph fails, keep local cache intact
    }

    return fullDecision;
  }

  public getDecision(decisionId: string): DecisionMetadata | null {
    return this.decisions.get(decisionId) || null;
  }

  public queryDecisions(filter: Partial<DecisionMetadata>): DecisionMetadata[] {
    const results: DecisionMetadata[] = [];
    
    for (const dec of this.decisions.values()) {
      let matches = true;
      if (filter.tenantId && dec.tenantId !== filter.tenantId) matches = false;
      if (filter.confidenceScore && dec.confidenceScore !== filter.confidenceScore) matches = false;
      
      if (matches) {
        results.push({ ...dec });
      }
    }

    return results;
  }
}
