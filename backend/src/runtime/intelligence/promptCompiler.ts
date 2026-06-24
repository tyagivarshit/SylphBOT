import { PromptTemplate } from "./types";
import { ConstitutionIntegrationLayer } from "./constitutionLayer";

export class PromptCompiler {
  private templates = new Map<string, PromptTemplate>();
  private constitutionLayer: ConstitutionIntegrationLayer;

  constructor(constitutionLayer = new ConstitutionIntegrationLayer()) {
    this.constitutionLayer = constitutionLayer;
    
    // Register default base template
    this.registerTemplate({
      id: "executive_core",
      version: "1.0.0",
      systemTemplate: "You are a Sylph Executive AI acting within the constraints of your Constitution.\n\n[MEMORIES]\n{{memory}}\n\n[KNOWLEDGE RETRIEVAL]\n{{knowledge}}\n\n[LEARNED PATTERNS & GUIDELINES]\n{{learning}}\n\n[AVAILABLE TOOLS]\n{{tools}}\n\n[OUTPUT FORMAT CONTRACT]\n{{contract}}",
      userTemplate: "User Input:\n{{input}}\n\nExecute context analysis and proceed with the reasoning pipeline.",
      requiredPlaceholders: ["memory", "knowledge", "learning", "tools", "contract", "input"]
    });
  }

  /**
   * Register a new versioned template artifact
   */
  public registerTemplate(template: PromptTemplate): void {
    const key = `${template.id}:${template.version}`;
    this.templates.set(key, template);
  }

  /**
   * Retrieve a registered prompt template
   */
  public getTemplate(id: string, version: string): PromptTemplate | null {
    const key = `${id}:${version}`;
    return this.templates.get(key) || null;
  }

  /**
   * Compile structured components into the final prompt context without manual string concatenation.
   */
  public compile(
    tenantId: string,
    templateId: string,
    version: string,
    components: {
      input: string;
      memories?: string;
      knowledge?: string;
      learnings?: string;
      tools?: string;
      contract?: string;
    },
    customVariables: Record<string, string> = {}
  ): { system: string; user: string } {
    const template = this.getTemplate(templateId, version);
    if (!template) {
      throw new Error(`Prompt template [${templateId}] version [${version}] not found.`);
    }

    // Merge standard components and custom variables
    const variables: Record<string, string> = {
      input: components.input,
      memory: components.memories || "No memory facts available for this context.",
      knowledge: components.knowledge || "No specific knowledge articles loaded.",
      learning: components.learnings || "Follow default reasoning patterns.",
      tools: components.tools || "No external tools registered.",
      contract: components.contract || "Provide standard natural language response.",
      ...customVariables
    };

    // Ensure all required placeholders are present
    for (const key of template.requiredPlaceholders) {
      if (!(key in variables)) {
        throw new Error(`Prompt compilation error: missing required placeholder [${key}].`);
      }
    }

    // AST-like template placeholder compiler
    const system = this.interpolateTemplate(template.systemTemplate, variables);
    const user = this.interpolateTemplate(template.userTemplate, variables);

    // Force Constitution Injection (Unbypassable layer)
    const systemWithConstitution = this.constitutionLayer.enforceConstitution(system, tenantId);

    return {
      system: systemWithConstitution,
      user
    };
  }

  /**
   * Replaces placeholders like {{placeholder}} with values
   */
  private interpolateTemplate(templateStr: string, variables: Record<string, string>): string {
    return templateStr.replace(/{{\s*(\w+)\s*}}/g, (match, key) => {
      if (key in variables) {
        return variables[key];
      }
      return match; // return original if not found
    });
  }
}
