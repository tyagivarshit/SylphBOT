import type { Request, Response, NextFunction, RequestHandler } from "express";

export const catchAsync = (fn: (req: any, res: Response, next: NextFunction) => Promise<any>): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
