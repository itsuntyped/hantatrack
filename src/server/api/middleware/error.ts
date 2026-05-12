import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";
import { createLogger } from "../../scraper/logger";

// Error handling middleware and helpers.
// Every error response shares the same `{ error: { code, message, id } }`
// envelope so clients can rely on a single shape.

const log = createLogger("api.error");

// Throw HttpError from any handler to short-circuit with a known status/code.
// The error handler below renders these as structured JSON.
export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// 404 handler — mounted explicitly under /api so unknown routes never fall
// through to the SSR page handler.
export const notFound = (req: Request, res: Response, _next: NextFunction): void => {
  res.status(404).json({
    error: { code: "not_found", message: `No route for ${req.method} ${req.path}`, id: req.id },
  });
};

// Top-level error handler. Differentiates between HttpError (expected,
// user-visible message) and everything else (logged with the stack, generic
// 500 returned to the client to avoid leaking internals).
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const isHttp = err instanceof HttpError;
  const status = isHttp ? err.status : 500;
  const code = isHttp ? err.code : "internal_error";
  const message = isHttp ? err.message : "An unexpected error occurred";

  // Always log with the request id so the response correlates to the log line.
  log.error(
    `[${req.id}] ${req.method} ${req.path} → ${status} ${code}: ${err instanceof Error ? err.message : String(err)}`,
    err instanceof Error ? err : new Error(String(err)),
  );

  res.status(status).json({
    error: { code, message, id: req.id },
  });
};
