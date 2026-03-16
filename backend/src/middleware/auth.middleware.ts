import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export const protect = (
  req: Request,
  res: Response,
  next: NextFunction
) => {

  const cookieToken = req.cookies?.accessToken;
  const headerToken = req.headers.authorization?.split(" ")[1];

  const token = cookieToken || headerToken;

  if (!token) {
    return res.status(401).json({ message: "Not authorized" });
  }

  try {

    const decoded = jwt.verify(token, env.JWT_SECRET) as {
      id: string;
      role: string;
      email: string;
      businessId: string;
    };

    req.user = {
      id: decoded.id,
      role: decoded.role,
      email: decoded.email,
      businessId: decoded.businessId
    };

    next();

  } catch {

    return res.status(401).json({ message: "Invalid token" });

  }

};