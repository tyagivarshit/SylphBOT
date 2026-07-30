import { RuntimeContext } from "./context";
import { IContextBuilder, IContextValidator, ContextBuilderResult } from "./builderTypes";
import {
  IdentityContextBuilder,
  BusinessContextBuilder,
  WorkspaceContextBuilder,
  ConversationContextBuilder,
  PermissionsContextBuilder,
  MetadataContextBuilder,
  TenantIsolationValidator,
  RequiredPropertiesValidator
} from "./contextBuilder";

export class ContextAssembler {
  private builders: IContextBuilder[] = [
    new IdentityContextBuilder(),
    new BusinessContextBuilder(),
    new WorkspaceContextBuilder(),
    new ConversationContextBuilder(),
    new PermissionsContextBuilder(),
    new MetadataContextBuilder(),
  ];

  private validators: IContextValidator[] = [
    new TenantIsolationValidator(),
    new RequiredPropertiesValidator(),
  ];

  /**
   * Registers a custom context builder.
   */
  public registerBuilder(builder: IContextBuilder): void {
    this.builders.push(builder);
  }

  /**
   * Registers a custom context validator.
   */
  public registerValidator(validator: IContextValidator): void {
    this.validators.push(validator);
  }

  /**
   * Sequentially enriches and validates the context based on request payload parameters.
   */
  public async assemble(initialContext: RuntimeContext, rawRequest: any): Promise<ContextBuilderResult> {
    let currentContext = initialContext;
    const errors: Error[] = [];
    const warnings: string[] = [];

    // 1. Run all builders sequentially
    for (const builder of this.builders) {
      try {
        currentContext = await builder.build(currentContext, rawRequest);
      } catch (err: any) {
        errors.push(new Error(`Builder [${builder.name}] failed: ${err.message}`));
      }
    }

    // 2. Run all validators sequentially
    for (const validator of this.validators) {
      try {
        const result = await validator.validate(currentContext);
        if (!result.isValid) {
          errors.push(...result.errors);
        }
        warnings.push(...result.warnings);
      } catch (err: any) {
        errors.push(new Error(`Validator [${validator.name}] failed: ${err.message}`));
      }
    }

    const success = errors.length === 0;
    return new ContextBuilderResult(success, currentContext, errors, warnings);
  }
}
