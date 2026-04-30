import crypto from "crypto";
import { execSync } from "child_process";

export type IntegrationEnvironment = {
  runId: string;
  databaseUrl: string;
  redisUrl: string;
  queuePrefix: string;
  webhookSecret: string;
};

const sanitizeToken = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const readRequired = (name: string, fallback?: string) => {
  const value = String(process.env[name] || fallback || "").trim();

  if (!value) {
    throw new Error(`Missing required integration environment variable: ${name}`);
  }

  return value;
};

const buildIsolatedMongoDatabaseUrl = (baseUrl: string, runId: string) => {
  const parsed = new URL(baseUrl);
  const existingDb = parsed.pathname.replace(/^\//, "").trim() || "sylph_integration";
  const isolatedDb = `${existingDb}_${sanitizeToken(runId)}`.slice(0, 63);

  parsed.pathname = `/${isolatedDb}`;
  return parsed.toString();
};

export const configureIntegrationEnvironment = (): IntegrationEnvironment => {
  const runId =
    String(process.env.INTEGRATION_RUN_ID || "").trim() ||
    `phase5a_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const sourceDatabaseUrl = readRequired(
    "INTEGRATION_DATABASE_URL",
    process.env.DATABASE_URL
  );
  const sourceRedisUrl = readRequired(
    "INTEGRATION_REDIS_URL",
    process.env.REDIS_URL
  );
  const webhookSecret =
    String(process.env.INTEGRATION_META_APP_SECRET || "").trim() ||
    "integration_meta_app_secret";
  const databaseUrl = buildIsolatedMongoDatabaseUrl(sourceDatabaseUrl, runId);
  const queuePrefix =
    String(process.env.INTEGRATION_QUEUE_PREFIX || "").trim() ||
    `itest:${sanitizeToken(runId)}`;

  process.env.NODE_ENV = "integration";
  process.env.RUN_WORKER = "true";
  process.env.ENABLE_CRON = "false";
  process.env.INTEGRATION_AUTH_BYPASS = "true";

  process.env.DATABASE_URL = databaseUrl;
  process.env.REDIS_URL = sourceRedisUrl;
  process.env.AI_QUEUE_PREFIX = queuePrefix;

  process.env.JWT_SECRET = String(process.env.JWT_SECRET || "integration_jwt_secret");
  process.env.JWT_REFRESH_SECRET = String(
    process.env.JWT_REFRESH_SECRET || "integration_refresh_secret"
  );
  process.env.FRONTEND_URL = String(
    process.env.FRONTEND_URL || "http://localhost:3000"
  );
  process.env.BACKEND_URL = String(
    process.env.BACKEND_URL || "http://localhost:5000"
  );
  process.env.STRIPE_SECRET_KEY = String(
    process.env.STRIPE_SECRET_KEY || "sk_test_integration"
  );
  process.env.GROQ_API_KEY = String(process.env.GROQ_API_KEY || "gsk_test_integration");
  process.env.CLOUDINARY_CLOUD_NAME = String(
    process.env.CLOUDINARY_CLOUD_NAME || "integration"
  );
  process.env.CLOUDINARY_API_KEY = String(
    process.env.CLOUDINARY_API_KEY || "integration"
  );
  process.env.CLOUDINARY_API_SECRET = String(
    process.env.CLOUDINARY_API_SECRET || "integration"
  );
  process.env.META_APP_SECRET = webhookSecret;
  process.env.INSTAGRAM_VERIFY_TOKEN = String(
    process.env.INSTAGRAM_VERIFY_TOKEN || "integration_verify_token"
  );
  process.env.PHASE5A_PREVIEW_BYPASS_ENABLED = "true";
  process.env.PHASE5A_LEGACY_RUNTIME_ENABLED = "false";

  return {
    runId,
    databaseUrl,
    redisUrl: sourceRedisUrl,
    queuePrefix,
    webhookSecret,
  };
};

export const applyIntegrationSchema = () => {
  if (process.env.INTEGRATION_SKIP_SCHEMA_PUSH === "true") {
    return;
  }

  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
};
