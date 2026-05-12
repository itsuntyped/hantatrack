import { randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

// Per-request correlation id middleware.
// Assigns a short random id to every request and echoes it back on the response
// as X-Request-Id so client errors can be traced through the logs.

// Extend Express's Request type so `req.id` is typed everywhere downstream.
declare module "express-serve-static-core" {
  interface Request {
    id: string;
  }
}

// Generate a 96-bit base64url id — short enough for headers, wide enough to
// avoid collisions in practice.
function newId(): string {
  return randomBytes(12).toString("base64url");
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.id = newId();
  res.setHeader("X-Request-Id", req.id);
  next();
}
