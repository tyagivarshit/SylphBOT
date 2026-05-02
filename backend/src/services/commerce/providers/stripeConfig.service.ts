import { STRIPE_PRICE_CATALOG } from "../../../config/stripe.price.map";
import { env } from "../../../config/env";
import { recordObservabilityEvent } from "../../reliability/reliabilityOS.service";

type StripeMode = "test" | "live" | "unknown";

type StripeConfigValidation = {
  valid: boolean;
  mode: StripeMode;
  issues: string[];
  warnings: string[];
  checkedAt: string;
  coverage: {
    standardPlanPriceCount: number;
    hasDuplicatePriceIds: boolean;
  };
};

const dedupe = (values: string[]) =>
  Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));

const getModeFromKey = (value?: string | null): StripeMode => {
  const key = String(value || "").trim();

  if (!key) {
    return "unknown";
  }

  if (key.startsWith("sk_test_") || key.startsWith("pk_test_")) {
    return "test";
  }

  if (key.startsWith("sk_live_") || key.startsWith("pk_live_")) {
    return "live";
  }

  return "unknown";
};

const getMaskedKey = (value?: string | null) => {
  const key = String(value || "").trim();

  if (!key) {
    return null;
  }

  if (key.length <= 10) {
    return `${key.slice(0, 4)}***`;
  }

  return `${key.slice(0, 7)}***${key.slice(-4)}`;
};

export const validateStripeConfig = (): StripeConfigValidation => {
  const issues: string[] = [];
  const warnings: string[] = [];

  const secretKey = String(env.STRIPE_SECRET_KEY || "").trim();
  const publishableKey = String(env.STRIPE_PUBLISHABLE_KEY || "").trim();
  const webhookSecret = String(env.STRIPE_WEBHOOK_SECRET || "").trim();
  const expectedMode = String(env.STRIPE_EXPECT_MODE || "").trim().toLowerCase();

  const secretMode = getModeFromKey(secretKey);
  const publishableMode = getModeFromKey(publishableKey);
  const mode: StripeMode =
    secretMode !== "unknown" ? secretMode : publishableMode !== "unknown" ? publishableMode : "unknown";

  if (!secretKey) {
    issues.push("stripe_secret_key_missing");
  } else if (secretMode === "unknown") {
    issues.push("stripe_secret_key_invalid_format");
  }

  if (!webhookSecret) {
    issues.push("stripe_webhook_secret_missing");
  } else if (!webhookSecret.startsWith("whsec_")) {
    issues.push("stripe_webhook_secret_invalid_format");
  }

  if (!publishableKey) {
    warnings.push("stripe_publishable_key_missing");
  } else if (publishableMode === "unknown") {
    issues.push("stripe_publishable_key_invalid_format");
  }

  if (
    secretMode !== "unknown" &&
    publishableMode !== "unknown" &&
    secretMode !== publishableMode
  ) {
    issues.push("stripe_publishable_secret_mode_mismatch");
  }

  if (expectedMode && expectedMode !== "test" && expectedMode !== "live") {
    issues.push("stripe_expected_mode_invalid");
  } else if (
    expectedMode &&
    mode !== "unknown" &&
    expectedMode !== mode
  ) {
    issues.push("stripe_mode_mismatch_expected");
  }

  const duplicatePriceIds =
    dedupe(STRIPE_PRICE_CATALOG.map((entry) => entry.priceId)).length !==
    STRIPE_PRICE_CATALOG.length;

  if (duplicatePriceIds) {
    issues.push("stripe_price_mapping_duplicate_price_id");
  }

  if (STRIPE_PRICE_CATALOG.length < 12) {
    warnings.push("stripe_price_mapping_incomplete_standard_catalog");
  }

  if (!["test", "live"].includes(mode)) {
    issues.push("stripe_mode_unknown");
  }

  return {
    valid: issues.length === 0,
    mode,
    issues: dedupe(issues),
    warnings: dedupe(warnings),
    checkedAt: new Date().toISOString(),
    coverage: {
      standardPlanPriceCount: STRIPE_PRICE_CATALOG.length,
      hasDuplicatePriceIds: duplicatePriceIds,
    },
  };
};

export const assertStripeConfigReady = ({
  requirePublishable = false,
  requireWebhookSecret = false,
}: {
  requirePublishable?: boolean;
  requireWebhookSecret?: boolean;
} = {}) => {
  const validation = validateStripeConfig();

  const issues = [...validation.issues];
  const publishableKey = String(env.STRIPE_PUBLISHABLE_KEY || "").trim();

  if (requirePublishable && !publishableKey) {
    issues.push("stripe_publishable_key_missing");
  }

  if (!requireWebhookSecret) {
    const index = issues.indexOf("stripe_webhook_secret_missing");
    if (index >= 0) {
      issues.splice(index, 1);
    }
  }

  if (issues.length) {
    throw new Error(`stripe_config_invalid:${issues.join(",")}`);
  }

  return validation;
};

export const emitStripeConfigValidation = async () => {
  const validation = validateStripeConfig();
  const eventType = validation.valid ? "stripe.config.valid" : "stripe.config.invalid";

  await recordObservabilityEvent({
    businessId: null,
    tenantId: null,
    eventType,
    message: validation.valid
      ? "Stripe configuration validated successfully."
      : "Stripe configuration validation failed.",
    severity: validation.valid ? "info" : "error",
    context: {
      component: "commerce_stripe_config",
      phase: "boot",
      provider: "STRIPE",
    },
    metadata: {
      mode: validation.mode,
      issues: validation.issues,
      warnings: validation.warnings,
      coverage: validation.coverage,
      checkedAt: validation.checkedAt,
      keyHints: {
        secret: getMaskedKey(env.STRIPE_SECRET_KEY),
        publishable: getMaskedKey(env.STRIPE_PUBLISHABLE_KEY),
        webhook: getMaskedKey(env.STRIPE_WEBHOOK_SECRET),
      },
    },
  }).catch(() => undefined);

  return validation;
};
