import { Request } from "express";

type DefaultBody = Record<string, unknown>;
type DefaultParams = Record<string, string>;
type DefaultQuery = Record<string, string | string[] | undefined>;

export type AuthenticatedRequest<
  TBody = DefaultBody,
  TParams = DefaultParams,
  TQuery = DefaultQuery,
> = Request<TParams, unknown, TBody, TQuery>;
