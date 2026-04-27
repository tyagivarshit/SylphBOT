type RevenueBrainDeliveryMode = "platform" | "local_preview" | "local_only";

export type RevenueBrainDeliveryEnvironment = {
  mode: RevenueBrainDeliveryMode;
  preview: boolean;
  simulation: boolean;
  sandbox: boolean;
  production: boolean;
};

export const resolveRevenueBrainDeliveryEnvironment = ({
  mode,
  preview = false,
  metadata,
}: {
  mode: RevenueBrainDeliveryMode;
  preview?: boolean;
  metadata?: Record<string, unknown> | null;
}): RevenueBrainDeliveryEnvironment => {
  const simulation =
    metadata?.internalSimulation === true || metadata?.onboardingDemo === true;
  const sandbox =
    metadata?.sandbox === true ||
    metadata?.sandboxMode === true ||
    metadata?.sandboxPreview === true;
  const effectivePreview =
    Boolean(preview) || mode === "local_preview" || metadata?.preview === true;

  return {
    mode,
    preview: effectivePreview,
    simulation,
    sandbox,
    production:
      mode === "platform" && !effectivePreview && !simulation && !sandbox,
  };
};

export const isRevenueBrainProductionLearningEligible = (
  environment: Pick<
    RevenueBrainDeliveryEnvironment,
    "mode" | "preview" | "simulation" | "sandbox" | "production"
  >
) => environment.mode === "platform" && environment.production;

export const resolveRevenueBrainDeliveryAttempt = ({
  attemptsMade,
  maxAttempts,
  retriable = true,
}: {
  attemptsMade: number;
  maxAttempts: number;
  retriable?: boolean;
}) => {
  const currentAttempt = Math.max(1, attemptsMade + 1);
  const budget = Math.max(1, maxAttempts);
  const willRetry = retriable && currentAttempt < budget;

  return {
    currentAttempt,
    maxAttempts: budget,
    retriable,
    willRetry,
    terminal: !willRetry,
  };
};
