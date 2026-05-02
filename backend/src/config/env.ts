import dotenv from "dotenv";

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";

const readEnv = (
  name: string,
  options?: {
    required?: boolean;
    defaultValue?: string;
  }
) => {
  const required = options?.required ?? true;
  const rawValue = process.env[name];
  const value = rawValue?.trim();

  if (!value) {
    if (options?.defaultValue !== undefined) {
      return options.defaultValue;
    }

    if (required) {
      throw new Error(`Missing required environment variable: ${name}`);
    }

    return undefined;
  }

  return value;
};

const readUrl = (
  name: string,
  options?: {
    required?: boolean;
    defaultValue?: string;
  }
) => {
  const value = readEnv(name, options);

  if (!value) {
    return undefined;
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }

  if (IS_PROD && parsed.protocol !== "https:") {
    throw new Error(`${name} must use https in production`);
  }

  return parsed.toString().replace(/\/$/, "");
};

const readNumber = (
  name: string,
  options?: {
    required?: boolean;
    defaultValue?: number;
    min?: number;
  }
) => {
  const value = readEnv(name, {
    required: options?.required,
    defaultValue:
      options?.defaultValue !== undefined
        ? String(options.defaultValue)
        : undefined,
  });

  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a valid number`);
  }

  if (options?.min !== undefined && parsed < options.min) {
    throw new Error(`${name} must be greater than or equal to ${options.min}`);
  }

  return parsed;
};

const readBoolean = (
  name: string,
  options?: {
    required?: boolean;
    defaultValue?: boolean;
  }
) => {
  const value = readEnv(name, {
    required: options?.required,
    defaultValue:
      options?.defaultValue === undefined
        ? undefined
        : options.defaultValue
        ? "true"
        : "false",
  });

  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`${name} must be a boolean`);
};

const readOriginList = (name: string) => {
  const value = readEnv(name, { required: false });

  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      try {
        return new URL(entry).origin;
      } catch {
        throw new Error(`${name} contains an invalid URL: ${entry}`);
      }
    });
};

const PORT = readNumber("PORT", {
  required: false,
  defaultValue: 5000,
  min: 1,
}) as number;

const FRONTEND_URL = readUrl("FRONTEND_URL", {
  required: false,
  defaultValue: "http://localhost:3000",
}) as string;

const BACKEND_URL = readUrl("BACKEND_URL", {
  required: false,
  defaultValue: IS_PROD ? undefined : `http://localhost:${PORT}`,
});

const FRONTEND_ORIGIN = new URL(FRONTEND_URL).origin;
const BACKEND_ORIGIN = BACKEND_URL
  ? new URL(BACKEND_URL).origin
  : undefined;

const ALLOWED_FRONTEND_ORIGINS = Array.from(
  new Set([FRONTEND_ORIGIN, ...readOriginList("FRONTEND_PREVIEW_ORIGINS")])
);

export const env = {
  NODE_ENV,
  IS_PROD,
  PORT,

  REDIS_URL: readEnv("REDIS_URL"),
  DATABASE_URL: readEnv("DATABASE_URL"),
  JWT_SECRET: readEnv("JWT_SECRET"),
  JWT_REFRESH_SECRET: readEnv("JWT_REFRESH_SECRET"),
  FRONTEND_URL,
  FRONTEND_ORIGIN,
  BACKEND_URL,
  BACKEND_ORIGIN,
  ALLOWED_FRONTEND_ORIGINS,

  STRIPE_SECRET_KEY: readEnv("STRIPE_SECRET_KEY", {
    required: false,
  }),
  STRIPE_PUBLISHABLE_KEY: readEnv("STRIPE_PUBLISHABLE_KEY", {
    required: false,
  }),
  STRIPE_WEBHOOK_SECRET: readEnv("STRIPE_WEBHOOK_SECRET", {
    required: false,
  }),
  STRIPE_EXPECT_MODE: readEnv("STRIPE_EXPECT_MODE", {
    required: false,
  }),
  STRIPE_BILLING_PORTAL_RETURN_URL: readUrl("STRIPE_BILLING_PORTAL_RETURN_URL", {
    required: false,
    defaultValue: `${FRONTEND_URL}/billing`,
  }) as string,
  EARLY_ACCESS_LIMIT: readNumber("EARLY_ACCESS_LIMIT", {
    required: false,
    defaultValue: 50,
    min: 0,
  }) as number,

  STRIPE_BASIC_INR_MONTHLY: readEnv("STRIPE_BASIC_INR_MONTHLY", {
    required: false,
  }),
  STRIPE_BASIC_INR_YEARLY: readEnv("STRIPE_BASIC_INR_YEARLY", {
    required: false,
  }),
  STRIPE_BASIC_INR_MONTHLY_EARLY: readEnv(
    "STRIPE_BASIC_INR_MONTHLY_EARLY",
    { required: false }
  ),
  STRIPE_BASIC_INR_YEARLY_EARLY: readEnv(
    "STRIPE_BASIC_INR_YEARLY_EARLY",
    { required: false }
  ),

  STRIPE_BASIC_USD_MONTHLY: readEnv("STRIPE_BASIC_USD_MONTHLY", {
    required: false,
  }),
  STRIPE_BASIC_USD_YEARLY: readEnv("STRIPE_BASIC_USD_YEARLY", {
    required: false,
  }),
  STRIPE_BASIC_USD_MONTHLY_EARLY: readEnv(
    "STRIPE_BASIC_USD_MONTHLY_EARLY",
    { required: false }
  ),
  STRIPE_BASIC_USD_YEARLY_EARLY: readEnv(
    "STRIPE_BASIC_USD_YEARLY_EARLY",
    { required: false }
  ),

  STRIPE_PRO_INR_MONTHLY: readEnv("STRIPE_PRO_INR_MONTHLY", {
    required: false,
  }),
  STRIPE_PRO_INR_YEARLY: readEnv("STRIPE_PRO_INR_YEARLY", {
    required: false,
  }),
  STRIPE_PRO_INR_MONTHLY_EARLY: readEnv(
    "STRIPE_PRO_INR_MONTHLY_EARLY",
    { required: false }
  ),
  STRIPE_PRO_INR_YEARLY_EARLY: readEnv(
    "STRIPE_PRO_INR_YEARLY_EARLY",
    { required: false }
  ),

  STRIPE_PRO_USD_MONTHLY: readEnv("STRIPE_PRO_USD_MONTHLY", {
    required: false,
  }),
  STRIPE_PRO_USD_YEARLY: readEnv("STRIPE_PRO_USD_YEARLY", {
    required: false,
  }),
  STRIPE_PRO_USD_MONTHLY_EARLY: readEnv(
    "STRIPE_PRO_USD_MONTHLY_EARLY",
    { required: false }
  ),
  STRIPE_PRO_USD_YEARLY_EARLY: readEnv(
    "STRIPE_PRO_USD_YEARLY_EARLY",
    { required: false }
  ),

  STRIPE_ELITE_INR_MONTHLY: readEnv("STRIPE_ELITE_INR_MONTHLY", {
    required: false,
  }),
  STRIPE_ELITE_INR_YEARLY: readEnv("STRIPE_ELITE_INR_YEARLY", {
    required: false,
  }),
  STRIPE_ELITE_INR_MONTHLY_EARLY: readEnv(
    "STRIPE_ELITE_INR_MONTHLY_EARLY",
    { required: false }
  ),
  STRIPE_ELITE_INR_YEARLY_EARLY: readEnv(
    "STRIPE_ELITE_INR_YEARLY_EARLY",
    { required: false }
  ),

  STRIPE_ELITE_USD_MONTHLY: readEnv("STRIPE_ELITE_USD_MONTHLY", {
    required: false,
  }),
  STRIPE_ELITE_USD_YEARLY: readEnv("STRIPE_ELITE_USD_YEARLY", {
    required: false,
  }),
  STRIPE_ELITE_USD_MONTHLY_EARLY: readEnv(
    "STRIPE_ELITE_USD_MONTHLY_EARLY",
    { required: false }
  ),
  STRIPE_ELITE_USD_YEARLY_EARLY: readEnv(
    "STRIPE_ELITE_USD_YEARLY_EARLY",
    { required: false }
  ),

  TWILIO_ACCOUNT_SID: readEnv("TWILIO_ACCOUNT_SID", {
    required: false,
  }),
  TWILIO_AUTH_TOKEN: readEnv("TWILIO_AUTH_TOKEN", {
    required: false,
  }),
  TWILIO_WHATSAPP_NUMBER: readEnv("TWILIO_WHATSAPP_NUMBER", {
    required: false,
  }),

  LOG_LEVEL: readEnv("LOG_LEVEL", {
    required: false,
    defaultValue: "info",
  }) as string,
  AI_QUEUE_NAME: "aiQueue" as const,
  AI_QUEUE_PREFIX: readEnv("AI_QUEUE_PREFIX", {
    required: false,
    defaultValue: "sylph",
  }) as string,
  AI_API_MAX_BATCH_SIZE: readNumber("AI_API_MAX_BATCH_SIZE", {
    required: false,
    defaultValue: 250,
    min: 1,
  }) as number,
  AI_JOB_BATCH_SIZE: readNumber("AI_JOB_BATCH_SIZE", {
    required: false,
    defaultValue: 25,
    min: 1,
  }) as number,
  AI_JOB_ATTEMPTS: 3 as const,
  AI_JOB_BACKOFF_MS: readNumber("AI_JOB_BACKOFF_MS", {
    required: false,
    defaultValue: 1000,
    min: 100,
  }) as number,
  AI_WORKER_CONCURRENCY: 20 as const,
  AI_WORKER_RATE_LIMIT_MAX: readNumber("AI_WORKER_RATE_LIMIT_MAX", {
    required: false,
    defaultValue: 20,
    min: 1,
  }) as number,
  AI_WORKER_RATE_LIMIT_DURATION_MS: readNumber(
    "AI_WORKER_RATE_LIMIT_DURATION_MS",
    {
      required: false,
      defaultValue: 1000,
      min: 1,
    }
  ) as number,
  AI_WORKER_LOCK_DURATION_MS: readNumber("AI_WORKER_LOCK_DURATION_MS", {
    required: false,
    defaultValue: 120000,
    min: 1000,
  }) as number,
  AI_WORKER_STALLED_INTERVAL_MS: readNumber(
    "AI_WORKER_STALLED_INTERVAL_MS",
    {
      required: false,
      defaultValue: 60000,
      min: 1000,
    }
  ) as number,
  AI_WORKER_DRAIN_DELAY_SECONDS: readNumber(
    "AI_WORKER_DRAIN_DELAY_SECONDS",
    {
      required: false,
      defaultValue: 5,
      min: 1,
    }
  ) as number,
  AI_WORKER_LEADER_LOCK_TTL_MS: readNumber(
    "AI_WORKER_LEADER_LOCK_TTL_MS",
    {
      required: false,
      defaultValue: 90000,
      min: 1000,
    }
  ) as number,
  AI_WORKER_LEADER_LOCK_RENEW_MS: readNumber(
    "AI_WORKER_LEADER_LOCK_RENEW_MS",
    {
      required: false,
      defaultValue: 30000,
      min: 1000,
    }
  ) as number,
  API_REQUEST_TIMEOUT_MS: readNumber("API_REQUEST_TIMEOUT_MS", {
    required: false,
    defaultValue: 1800,
    min: 100,
  }) as number,
  PHASE5A_PREVIEW_BYPASS_ENABLED: readBoolean(
    "PHASE5A_PREVIEW_BYPASS_ENABLED",
    {
      required: false,
      defaultValue: !IS_PROD,
    }
  ) as boolean,
  PHASE5A_LEGACY_RUNTIME_ENABLED: readBoolean(
    "PHASE5A_LEGACY_RUNTIME_ENABLED",
    {
      required: false,
      defaultValue: false,
    }
  ) as boolean,
  REDIS_CONNECT_TIMEOUT_MS: readNumber("REDIS_CONNECT_TIMEOUT_MS", {
    required: false,
    defaultValue: 10000,
    min: 100,
  }) as number,
  REDIS_RETRY_DELAY_MS: readNumber("REDIS_RETRY_DELAY_MS", {
    required: false,
    defaultValue: 250,
    min: 10,
  }) as number,
  REDIS_MAX_RETRY_DELAY_MS: readNumber("REDIS_MAX_RETRY_DELAY_MS", {
    required: false,
    defaultValue: 2000,
    min: 10,
  }) as number,
};
