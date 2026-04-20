import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";

export const asyncHandler = <
  TRequest extends Request = Request,
  TResponse extends Response = Response,
>(
  handler: (
    req: TRequest,
    res: TResponse,
    next: NextFunction
  ) => Promise<unknown>
): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(handler(req as TRequest, res as TResponse, next)).catch(
      next
    );
  };
};
