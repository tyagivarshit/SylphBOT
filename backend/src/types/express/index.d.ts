import "express";
import type { AppLogger } from "../../utils/logger";
import type { RequestLifecycleState } from "../../utils/requestLifecycle";

declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
    logger?: AppLogger;
    requestLifecycle?: RequestLifecycleState;
    rawBody?: Buffer;
    businessId?: string | null;
    tenant?: {
      businessId: string | null;
    };
    apiKey?: {
      id: string;
      businessId: string;
      permissions: string[];
      scopes: string[];
      name?: string | null;
    };
    user?: {
      id: string;
      role: string;
      email?: string;
      businessId: string | null;
    };
  }
}
