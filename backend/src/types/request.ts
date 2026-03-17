import { Request } from "express";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    email: string;
    businessId: string;
  };
}