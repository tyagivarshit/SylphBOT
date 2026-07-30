import { RuntimeContext } from "./context";

export interface IContextBuilder {
  readonly name: string;
  build(currentContext: RuntimeContext, rawRequest: any): Promise<RuntimeContext>;
}

export interface IContextValidationResult {
  readonly isValid: boolean;
  readonly errors: Error[];
  readonly warnings: string[];
}

export interface IContextValidator {
  readonly name: string;
  validate(context: RuntimeContext): Promise<IContextValidationResult>;
}

export class ContextBuilderResult {
  constructor(
    public readonly success: boolean,
    public readonly context: RuntimeContext,
    public readonly errors: Error[] = [],
    public readonly warnings: string[] = []
  ) {}
}

export class ContextValidationResult implements IContextValidationResult {
  constructor(
    public readonly isValid: boolean,
    public readonly errors: Error[] = [],
    public readonly warnings: string[] = []
  ) {}
}
