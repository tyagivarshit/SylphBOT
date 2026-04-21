import pino, { type Logger as PinoLogger } from "pino";
import { env } from "../config/env";
import { buildContextBindings } from "../observability/requestContext";

type LogMethod = (...args: unknown[]) => void;

export type AppLogger = {
  trace: LogMethod;
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
  fatal: LogMethod;
  child: (bindings: Record<string, unknown>) => AppLogger;
  raw: PinoLogger;
};

const transport = env.IS_PROD
  ? undefined
  : pino.transport({
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname",
      },
    });

const baseLogger = pino(
  {
    level: env.LOG_LEVEL,
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
  },
  transport
);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  !(value instanceof Error);

const sanitizeObject = (value: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  );

const serializeErrorLike = (value: unknown) => {
  if (value instanceof Error) {
    return value;
  }

  if (isPlainObject(value)) {
    const normalized = sanitizeObject(value);

    return Object.keys(normalized).length
      ? normalized
      : {
          message: "Unknown error object",
        };
  }

  if (value === undefined) {
    return undefined;
  }

  return {
    message: String(value),
  };
};

const normalizeLogObject = (value: Record<string, unknown>) => {
  const normalized = sanitizeObject(
    Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        entry instanceof Error ? pino.stdSerializers.err(entry) : entry,
      ])
    )
  );
  const errCandidate = value.err ?? value.error;
  const err = serializeErrorLike(errCandidate);

  if (err !== undefined) {
    normalized.err = err;
  }

  return normalized;
};

const writeLog =
  (level: keyof Pick<PinoLogger, "trace" | "debug" | "info" | "warn" | "error" | "fatal">, bindings: Record<string, unknown>): LogMethod =>
  (...args: unknown[]) => {
    const logMethod = (baseLogger[level] as (...methodArgs: any[]) => void).bind(baseLogger);
    const contextBindings = normalizeLogObject(buildContextBindings());
    const mergedBindings = normalizeLogObject({
      ...contextBindings,
      ...bindings,
    });

    if (!args.length) {
      logMethod(mergedBindings);
      return;
    }

    const [firstArg, ...restArgs] = args;

    if (isPlainObject(firstArg)) {
      logMethod(
        {
          ...mergedBindings,
          ...normalizeLogObject(firstArg),
        },
        ...restArgs
      );
      return;
    }

    if (firstArg instanceof Error) {
      logMethod(
        {
          ...mergedBindings,
          err: firstArg,
        },
        ...restArgs
      );
      return;
    }

    if (Object.keys(mergedBindings).length > 0) {
      logMethod(mergedBindings, firstArg, ...restArgs);
      return;
    }

    logMethod(firstArg, ...restArgs);
  };

const createLogger = (bindings: Record<string, unknown> = {}): AppLogger => ({
  trace: writeLog("trace", bindings),
  debug: writeLog("debug", bindings),
  info: writeLog("info", bindings),
  warn: writeLog("warn", bindings),
  error: writeLog("error", bindings),
  fatal: writeLog("fatal", bindings),
  child: (childBindings) =>
    createLogger({
      ...bindings,
      ...normalizeLogObject(childBindings),
    }),
  raw: baseLogger,
});

const logger = createLogger();

export default logger;
