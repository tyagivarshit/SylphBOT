"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";
const readEnv = (name, options) => {
    const required = options?.required ?? true;
    const value = process.env[name]?.trim();
    if (!value) {
        if (required) {
            throw new Error(`Missing required environment variable: ${name}`);
        }
        return undefined;
    }
    return value;
};
const readUrl = (name, options) => {
    const value = readEnv(name, options);
    if (!value) {
        return undefined;
    }
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch {
        throw new Error(`${name} must be a valid absolute URL`);
    }
    if (IS_PROD && parsed.protocol !== "https:") {
        throw new Error(`${name} must use https in production`);
    }
    return parsed.toString().replace(/\/$/, "");
};
const readNumber = (name, options) => {
    const value = readEnv(name, { required: options?.required });
    if (!value) {
        return options?.defaultValue;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`${name} must be a valid number`);
    }
    return parsed;
};
const readOriginList = (name) => {
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
        }
        catch {
            throw new Error(`${name} contains an invalid URL: ${entry}`);
        }
    });
};
const FRONTEND_URL = readUrl("FRONTEND_URL");
const BACKEND_URL = readUrl("BACKEND_URL", {
    required: IS_PROD,
});
const FRONTEND_ORIGIN = new URL(FRONTEND_URL).origin;
const BACKEND_ORIGIN = BACKEND_URL
    ? new URL(BACKEND_URL).origin
    : undefined;
const ALLOWED_FRONTEND_ORIGINS = Array.from(new Set([FRONTEND_ORIGIN, ...readOriginList("FRONTEND_PREVIEW_ORIGINS")]));
exports.env = {
    NODE_ENV,
    IS_PROD,
    REDIS_URL: readEnv("REDIS_URL"),
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
    STRIPE_WEBHOOK_SECRET: readEnv("STRIPE_WEBHOOK_SECRET", {
        required: false,
    }),
    EARLY_ACCESS_LIMIT: readNumber("EARLY_ACCESS_LIMIT", {
        required: false,
        defaultValue: 50,
    }),
    STRIPE_BASIC_INR_MONTHLY: readEnv("STRIPE_BASIC_INR_MONTHLY", {
        required: false,
    }),
    STRIPE_BASIC_INR_YEARLY: readEnv("STRIPE_BASIC_INR_YEARLY", {
        required: false,
    }),
    STRIPE_BASIC_INR_MONTHLY_EARLY: readEnv("STRIPE_BASIC_INR_MONTHLY_EARLY", { required: false }),
    STRIPE_BASIC_INR_YEARLY_EARLY: readEnv("STRIPE_BASIC_INR_YEARLY_EARLY", { required: false }),
    STRIPE_BASIC_USD_MONTHLY: readEnv("STRIPE_BASIC_USD_MONTHLY", {
        required: false,
    }),
    STRIPE_BASIC_USD_YEARLY: readEnv("STRIPE_BASIC_USD_YEARLY", {
        required: false,
    }),
    STRIPE_BASIC_USD_MONTHLY_EARLY: readEnv("STRIPE_BASIC_USD_MONTHLY_EARLY", { required: false }),
    STRIPE_BASIC_USD_YEARLY_EARLY: readEnv("STRIPE_BASIC_USD_YEARLY_EARLY", { required: false }),
    STRIPE_PRO_INR_MONTHLY: readEnv("STRIPE_PRO_INR_MONTHLY", {
        required: false,
    }),
    STRIPE_PRO_INR_YEARLY: readEnv("STRIPE_PRO_INR_YEARLY", {
        required: false,
    }),
    STRIPE_PRO_INR_MONTHLY_EARLY: readEnv("STRIPE_PRO_INR_MONTHLY_EARLY", { required: false }),
    STRIPE_PRO_INR_YEARLY_EARLY: readEnv("STRIPE_PRO_INR_YEARLY_EARLY", { required: false }),
    STRIPE_PRO_USD_MONTHLY: readEnv("STRIPE_PRO_USD_MONTHLY", {
        required: false,
    }),
    STRIPE_PRO_USD_YEARLY: readEnv("STRIPE_PRO_USD_YEARLY", {
        required: false,
    }),
    STRIPE_PRO_USD_MONTHLY_EARLY: readEnv("STRIPE_PRO_USD_MONTHLY_EARLY", { required: false }),
    STRIPE_PRO_USD_YEARLY_EARLY: readEnv("STRIPE_PRO_USD_YEARLY_EARLY", { required: false }),
    STRIPE_ELITE_INR_MONTHLY: readEnv("STRIPE_ELITE_INR_MONTHLY", {
        required: false,
    }),
    STRIPE_ELITE_INR_YEARLY: readEnv("STRIPE_ELITE_INR_YEARLY", {
        required: false,
    }),
    STRIPE_ELITE_INR_MONTHLY_EARLY: readEnv("STRIPE_ELITE_INR_MONTHLY_EARLY", { required: false }),
    STRIPE_ELITE_INR_YEARLY_EARLY: readEnv("STRIPE_ELITE_INR_YEARLY_EARLY", { required: false }),
    STRIPE_ELITE_USD_MONTHLY: readEnv("STRIPE_ELITE_USD_MONTHLY", {
        required: false,
    }),
    STRIPE_ELITE_USD_YEARLY: readEnv("STRIPE_ELITE_USD_YEARLY", {
        required: false,
    }),
    STRIPE_ELITE_USD_MONTHLY_EARLY: readEnv("STRIPE_ELITE_USD_MONTHLY_EARLY", { required: false }),
    STRIPE_ELITE_USD_YEARLY_EARLY: readEnv("STRIPE_ELITE_USD_YEARLY_EARLY", { required: false }),
    TWILIO_ACCOUNT_SID: readEnv("TWILIO_ACCOUNT_SID", {
        required: false,
    }),
    TWILIO_AUTH_TOKEN: readEnv("TWILIO_AUTH_TOKEN", {
        required: false,
    }),
    TWILIO_WHATSAPP_NUMBER: readEnv("TWILIO_WHATSAPP_NUMBER", {
        required: false,
    }),
};
