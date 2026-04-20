"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pino_1 = __importDefault(require("pino"));
const env_1 = require("../config/env");
const requestContext_1 = require("../observability/requestContext");
const transport = env_1.env.IS_PROD
    ? undefined
    : pino_1.default.transport({
        target: "pino-pretty",
        options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
        },
    });
const baseLogger = (0, pino_1.default)({
    level: env_1.env.LOG_LEVEL,
    base: undefined,
    redact: {
        paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "headers.authorization",
            "headers.cookie",
            "headers.stripe-signature",
            "headers.x-hub-signature",
            "headers.x-hub-signature-256",
            "headers.x-api-key",
            "authorization",
            "cookie",
            "apiKey",
            "password",
            "token",
            "accessToken",
            "refreshToken",
            "accessTokenEncrypted",
            "secret",
            "*.password",
            "*.token",
            "*.secret",
            "*.accessToken",
            "*.refreshToken",
            "*.accessTokenEncrypted",
        ],
        remove: true,
    },
}, transport);
const isPlainObject = (value) => Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Error);
const sanitizeObject = (value) => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
const writeLog = (level, bindings) => (...args) => {
    const logMethod = baseLogger[level].bind(baseLogger);
    const contextBindings = sanitizeObject((0, requestContext_1.buildContextBindings)());
    const mergedBindings = sanitizeObject({
        ...contextBindings,
        ...bindings,
    });
    if (!args.length) {
        logMethod(mergedBindings);
        return;
    }
    const [firstArg, ...restArgs] = args;
    if (isPlainObject(firstArg)) {
        logMethod({
            ...mergedBindings,
            ...sanitizeObject(firstArg),
        }, ...restArgs);
        return;
    }
    if (firstArg instanceof Error) {
        logMethod({
            ...mergedBindings,
            err: firstArg,
        }, ...restArgs);
        return;
    }
    if (Object.keys(mergedBindings).length > 0) {
        logMethod(mergedBindings, firstArg, ...restArgs);
        return;
    }
    logMethod(firstArg, ...restArgs);
};
const createLogger = (bindings = {}) => ({
    trace: writeLog("trace", bindings),
    debug: writeLog("debug", bindings),
    info: writeLog("info", bindings),
    warn: writeLog("warn", bindings),
    error: writeLog("error", bindings),
    fatal: writeLog("fatal", bindings),
    child: (childBindings) => createLogger({
        ...bindings,
        ...sanitizeObject(childBindings),
    }),
    raw: baseLogger,
});
const logger = createLogger();
exports.default = logger;
