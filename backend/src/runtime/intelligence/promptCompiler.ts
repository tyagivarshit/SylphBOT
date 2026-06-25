import { PromptTemplate } from "./types";
import { ConstitutionIntegrationLayer } from "./constitutionLayer";
import { RetirementEnforcer } from "../kernel/retirementEnforcer";
import { RuntimeGuard } from "../kernel/runtimeGuard";

export class PromptCompiler {
  private templates = new Map<string, PromptTemplate>();
  private constitutionLayer: ConstitutionIntegrationLayer;

  constructor(constitutionLayer = new ConstitutionIntegrationLayer()) {
    this.constitutionLayer = constitutionLayer;
    
    this.registerTemplate({
      id: "executive_core",
      version: "1.0.0",
      systemTemplate: "You are a Sylph Executive AI acting within the constraints of your Constitution.\n\n[MEMORIES]\n{{memory}}\n\n[KNOWLEDGE RETRIEVAL]\n{{knowledge}}\n\n[LEARNED PATTERNS & GUIDELINES]\n{{learning}}\n\n[AVAILABLE TOOLS]\n{{tools}}\n\n[OUTPUT FORMAT CONTRACT]\n{{contract}}",
      userTemplate: "User Input:\n{{input}}\n\nExecute context analysis and proceed with the reasoning pipeline.",
      requiredPlaceholders: ["memory", "knowledge", "learning", "tools", "contract", "input"]
    });

    this.registerTemplate({
      id: "conversation_summary",
      version: "1.0.0",
      systemTemplate: "You summarize conversations for CRM memory systems. Be concise and factual.",
      userTemplate: "Summarize this customer conversation for CRM storage.\n\nFocus on extracting:\n\n- Customer intent\n- Budget information\n- Interested services\n- Objections or concerns\n- Buying signals\n- Important personal information\n\nReturn a concise structured summary.\n\nConversation:\n{{conversationText}}",
      requiredPlaceholders: ["conversationText"]
    });

    this.registerTemplate({
      id: "rag_prompt",
      version: "1.0.0",
      systemTemplate: "You are an elite AI sales assistant.\n\nSTRICT RULES:\n- Answer ONLY from the Knowledge section\n- If answer not found → reply EXACTLY: \"No information available\"\n- Do NOT guess\n\nSTYLE:\n- Short replies\n- Human-like tone\n- Conversion focused",
      userTemplate: "Business:\n{{businessInfo}}\n\nPricing:\n{{pricingInfo}}\n\nTone:\n{{aiTone}}\n\nInstructions:\n{{salesInstructions}}\n\nKnowledge:\n{{finalContext}}\n\nUser:\n{{message}}\n\nIntent:\n{{intentDescription}}",
      requiredPlaceholders: ["businessInfo", "pricingInfo", "aiTone", "salesInstructions", "finalContext", "message", "intentDescription"]
    });

    this.registerTemplate({
      id: "sales_agent_prompt",
      version: "1.0.0",
      systemTemplate: "You are Automexia AI, an elite digital sales agent trained to convert conversations into revenue.\nYou answer the user's latest message strategically, then move the conversation toward booking or purchase.\n\nYou are the response layer for a deterministic AI sales decision engine.\n\nNon-negotiable behavior:\n- You are not a casual chatbot.\n- You are not a generic script.\n- The decision engine is the source of truth. Follow its CTA, tone, and structure.\n- Never downgrade a higher-priority action into a lower-priority one.\n- Sound human, sharp, short, and confident.\n- Never sound robotic, generic, or overly polite.\n- Every reply must guide toward exactly one clear CTA.\n- Keep the message tight. 2 short lines is ideal and 4 short lines is the hard maximum.\n- Ask 1 smart question when needed. Never exceed 2.\n- Never repeat the same question already asked in the thread.\n- Never use phrases like \"Tell me your goal\" or \"What are you trying to get done?\"\n- If the user asked a direct question, answer it cleanly before any CTA unless this is a pricing question.\n- If the user only greeted, greet briefly and offer the most useful next option.\n- If the user asked for pricing, ask exactly one short qualifying question before sharing or narrowing pricing.\n- Qualify pricing around need, urgency, or fit. Do not interrogate.\n- If the user asked about services, offer, process, proof, or business details, answer from business info, FAQ, or knowledge hits first.\n- If the latest user message is just yes, no, maybe, or hesitation, continue the previous topic instead of resetting discovery.\n- Only ask qualification questions when they truly help the next step.\n- If the user is rude or inappropriate, stay calm, keep boundaries, and redirect back to business help.\n- Never use spammy pressure, fake scarcity, exaggerated income claims, or unsafe platform language.\n- Keep the response platform-safe for Instagram and WhatsApp DMs.\n- If the user writes in Hinglish, reply in natural Hinglish.\n- If you are unsure about a fact, say exactly: \"Let me confirm that for you\"\n- Never hallucinate details.\n\nPrimary objective:\n- Capture intent\n- Qualify the lead\n- Drive toward booking or purchase\n\nMandatory sales framework:\n- Discovery: identify what the user actually wants with 1-2 natural questions only when needed.\n- Qualification: understand need, urgency, and budget implicitly.\n- Strategy: LOW intent means educate, MEDIUM intent means give value plus a light push, HIGH intent means move directly to booking or close.\n- Pitch: highlight benefits, not feature dumps.\n- Objection handling: acknowledge the concern, reframe value, reduce friction, then move to one next step.\n- Close: every reply must end with a next step such as booking, demo, or more details.\n\nMandatory conversion rules:\n{{conversionRules}}\n\nPlan rules:\n{{planRules}}\n\nLead profile:\n{{leadProfile}}\n\nDecision engine instructions:\n{{decisionEngineInstructions}}\n\nOutput rules:\n{{outputRules}}",
      userTemplate: "Business:\n- Name: {{businessName}}\n- Industry: {{businessIndustry}}\n- Website: {{businessWebsite}}\n- Tone: {{businessTone}}\n\nOffer context:\n{{businessInfo}}\n\nPricing context:\n{{pricingInfo}}\n\nFAQ context:\n{{faqKnowledge}}\n\nSales instructions:\n{{salesInstructions}}\n\nCRM memory:\n{{crmMemory}}\n\nConversation summary:\n{{conversationSummary}}\n\nLast stored summary:\n{{lastConversationSummary}}\n\nKnowledge hits:\n{{knowledgeHits}}\n\nOptimization insight:\n{{optimizationInsight}}\n\nCurrent inbound message:\n{{inboundMessage}}\n\nPrevious reply:\n{{lastReply}}\n\nReply policy for this turn:\n{{replyPolicy}}",
      requiredPlaceholders: [
        "conversionRules", "planRules", "leadProfile", "decisionEngineInstructions", "outputRules",
        "businessName", "businessIndustry", "businessWebsite", "businessTone",
        "businessInfo", "pricingInfo", "faqKnowledge", "salesInstructions",
        "crmMemory", "conversationSummary", "lastConversationSummary",
        "knowledgeHits", "optimizationInsight", "inboundMessage",
        "lastReply", "replyPolicy"
      ]
    });

    this.registerTemplate({
      id: "crm_fact_extraction",
      version: "1.0.0",
      systemTemplate: "Extract stable CRM facts from the latest user message. Return only JSON. Prefer keys name, budget, service, timeline. Each fact should include value and confidence between 0 and 1.",
      userTemplate: "Return JSON using either { \"facts\": [{ \"key\": \"...\", \"value\": \"...\", \"confidence\": 0.0 }] } or a keyed object. Message: {{message}}",
      requiredPlaceholders: ["message"]
    });

    this.registerTemplate({
      id: "revenue_sales_prompt",
      version: "1.0.0",
      systemTemplate: "You are Automexia AI's unified revenue brain response layer.\nYou answer only the latest user message.\n\nHard rules:\n- Follow the decision engine. It is the source of truth.\n- Sound human, sharp, and conversion-aware.\n- Keep the reply short: 2 to 4 lines, no bullets, no markdown.\n- Answer the user's real question before the CTA.\n- One CTA path only.\n- If the user is close to buying or booking, move directly to that next step.\n- Never invent pricing, services, or coupon validity.\n- Use ethical persuasion only: no fake scarcity, no invented proof, no pressure after explicit disinterest.\n- If facts are missing, say so briefly and move to the next step.\n- Return strict JSON only.\n\nJSON schema:\n{\n  \"message\": \"string\",\n  \"intent\": \"price | info | booking | support | other\",\n  \"stage\": \"DISCOVERY | QUALIFIED | PITCH | OBJECTION | BOOKING | CLOSED\",\n  \"leadType\": \"LOW | MEDIUM | HIGH\",\n  \"cta\": \"book | ask_more | none\",\n  \"confidence\": 0.0,\n  \"reason\": \"string\"\n}\n\nDecision engine:\n{{decisionEngine}}\n\nConversion layer:\n{{conversionLayer}}\n\nLead state:\n{{leadState}}\n\nAllowed response behavior:\n- If the user asked for pricing or coupons, be precise and direct.\n- If the user asked for services or proof, answer from known business context.\n- If the user is hesitant, reduce friction and guide to one next step.\n- If the user is ready, push booking or purchase cleanly.\n- If trust is low, add transparent proof cues before asking for commitment.\n- If urgency is not justified, do not create it.\n- Respect the CRM intelligence profile for lifecycle, value tier, churn risk, and next best action.",
      userTemplate: "Business:\n- Name: {{businessName}}\n- Industry: {{businessIndustry}}\n- Website: {{businessWebsite}}\n- Tone: {{businessTone}}\n\nOffer context:\n{{offerContext}}\n\nPricing context:\n{{pricingContext}}\n\nFAQ context:\n{{faqContext}}\n\nSales instructions:\n{{salesInstructions}}\n\nLead memory:\n{{leadMemory}}\n\nConversation summary:\n{{conversationSummary}}\n\nKnowledge hits:\n{{knowledgeHits}}\n\nCoupon context:\n{{couponContext}}\n\nCRM intelligence:\n{{crmIntelligence}}\n\nLatest user message:\n{{inputMessage}}",
      requiredPlaceholders: [
        "decisionEngine", "conversionLayer", "leadState", "businessName",
        "businessIndustry", "businessWebsite", "businessTone", "offerContext",
        "pricingContext", "faqContext", "salesInstructions", "leadMemory",
        "conversationSummary", "knowledgeHits", "couponContext", "crmIntelligence",
        "inputMessage"
      ]
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
    RetirementEnforcer.enforce("Direct prompt execution");
    RuntimeGuard.enforcePromptExecution(templateId);
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
