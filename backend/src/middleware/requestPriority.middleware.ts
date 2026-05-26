import type { NextFunction, Request, Response } from "express";

export const getRequestPriorityRuntimeSnapshot = () => ({
  active: {
    critical: 0,
    normal: 0,
    low: 0,
    total: 0,
  },
  queue: {
    critical: 0,
    normal: 0,
    low: 0,
    total: 0,
  },
});

export const requestPriorityMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return next();
};
