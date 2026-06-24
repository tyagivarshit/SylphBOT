export class ValidationEngine {
  constructor() {}

  /**
   * Validates input values against the tool's parameter schema.
   */
  public validateInput(schema: Record<string, any>, input: any): { isValid: boolean; errors: string[] } {
    if (!schema) return { isValid: true, errors: [] };
    const errors: string[] = [];

    // Assuming a standard JSON Schema draft structure
    const properties = schema.properties || {};
    const required = schema.required || [];

    // Verify required fields
    for (const key of required) {
      if (input === undefined || input === null || input[key] === undefined || input[key] === null) {
        errors.push(`Missing required parameter: [${key}]`);
      }
    }

    if (input && typeof input === "object") {
      for (const [key, value] of Object.entries(input)) {
        const propSchema = properties[key];
        if (!propSchema) {
          // Strict validation: reject undeclared properties if configured
          if (schema.additionalProperties === false) {
            errors.push(`Parameter [${key}] is not declared in the schema.`);
          }
          continue;
        }

        // Validate type
        const expectedType = propSchema.type;
        const actualType = typeof value;
        
        if (expectedType === "number" && actualType !== "number") {
          errors.push(`Parameter [${key}] expected type [number], got [${actualType}].`);
        } else if (expectedType === "string" && actualType !== "string") {
          errors.push(`Parameter [${key}] expected type [string], got [${actualType}].`);
        } else if (expectedType === "boolean" && actualType !== "boolean") {
          errors.push(`Parameter [${key}] expected type [boolean], got [${actualType}].`);
        } else if (expectedType === "array" && !Array.isArray(value)) {
          errors.push(`Parameter [${key}] expected type [array], got [${actualType}].`);
        } else if (expectedType === "object" && (actualType !== "object" || Array.isArray(value))) {
          errors.push(`Parameter [${key}] expected type [object], got [${actualType}].`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates output contracts.
   */
  public validateOutput(schema: Record<string, any>, output: any): { isValid: boolean; errors: string[] } {
    // Basic output format validation, similar to input schema mapping
    return this.validateInput(schema, output);
  }

  /**
   * Audits input payloads for security vulnerabilities (XSS, SQL injections).
   */
  public validateSafety(input: any): { isSafe: boolean; blockReason?: string } {
    if (!input) return { isSafe: true };

    const payloadStr = JSON.stringify(input);

    // Simple business-agnostic SQL Injection pattern detection
    const sqlInjectionPattern = /('|--|#|\/\*|\*\/|union\s+select|select\s+.*\s+from)/i;
    if (sqlInjectionPattern.test(payloadStr)) {
      return {
        isSafe: false,
        blockReason: "Potential SQL Injection signature detected in payload."
      };
    }

    // Simple XSS detection
    const xssPattern = /(<script|javascript:|onerror=|onload=)/i;
    if (xssPattern.test(payloadStr)) {
      return {
        isSafe: false,
        blockReason: "Potential Cross-Site Scripting (XSS) script tags detected in payload."
      };
    }

    return { isSafe: true };
  }
}
