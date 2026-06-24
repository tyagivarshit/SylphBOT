import { AIConstitution } from "./types";

export class ConstitutionIntegrationLayer {
  private constitutions = new Map<string, AIConstitution>();
  
  // Default master constitution for the platform (completely business-agnostic)
  private defaultConstitution: AIConstitution = {
    version: "1.0.0",
    corePrinciples: [
      "Helpful, honest, and harmless behavior at all times.",
      "Never disclose system credentials, encryption keys, or tenant boundary configs.",
      "Ensure complete multi-tenant isolation; never leak details between business boundaries.",
    ],
    permissionRules: [
      "Access only data explicitly mapped to the active tenant/business ID.",
      "Reject operations that request execution outside the sandboxed tools interface.",
    ],
    policies: [
      "Maintain neutral, objective response tones.",
      "Explicitly decline requests that request violation of legal or safety guidelines.",
    ],
    escalationRules: [
      "If the intent is ambiguous or contains high customer frustration, route to human queue immediately.",
      "If tool failures occur more than 3 times consecutively, raise a system alert and fallback to safety mode.",
    ],
    hallucinationPolicies: [
      "If the correct facts are not found in the injected knowledge context, state that you do not know the answer.",
      "Never fabricate URLs, phone numbers, contact names, or prices.",
      "Only quote values explicitly verified in Memory or Knowledge.",
    ]
  };

  constructor() {}

  /**
   * Register a custom constitution override for a tenant/business
   */
  public registerTenantConstitution(tenantId: string, constitution: AIConstitution): void {
    this.constitutions.set(tenantId, constitution);
  }

  /**
   * Retrieve the active constitution for a tenant (falls back to default)
   */
  public getConstitution(tenantId: string): AIConstitution {
    return this.constitutions.get(tenantId) || this.defaultConstitution;
  }

  /**
   * Format the constitution rules into a structured text block for injection.
   * Completely business-agnostic template structure.
   */
  public compileConstitutionSection(tenantId: string): string {
    const constitution = this.getConstitution(tenantId);
    
    const lines = [
      `=== AI COGNITIVE CONSTITUTION V${constitution.version} ===`,
      "",
      "CORE PRINCIPLES:",
      ...constitution.corePrinciples.map(p => `- ${p}`),
      "",
      "DATA PERMISSION RULES:",
      ...constitution.permissionRules.map(r => `- ${r}`),
      "",
      "OPERATIONAL POLICIES:",
      ...constitution.policies.map(p => `- ${p}`),
      "",
      "ESCALATION RULES & TRIGGER POINTS:",
      ...constitution.escalationRules.map(e => `- ${e}`),
      "",
      "HALLUCINATION MITIGATION RULES:",
      ...constitution.hallucinationPolicies.map(h => `- ${h}`),
      "",
      "============================================="
    ];

    return lines.join("\n");
  }

  /**
   * Injects the constitution block into a system prompt.
   * This is a hard constraint that cannot be bypassed.
   */
  public enforceConstitution(systemPrompt: string, tenantId: string): string {
    const constitutionText = this.compileConstitutionSection(tenantId);
    
    // Auto-inject at the top to establish primary instruction relevance
    return `${constitutionText}\n\n${systemPrompt}`;
  }
}
