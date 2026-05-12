import { rateLimit, ipKeyGenerator, type Options } from "express-rate-limit";
import type { RequestHandler } from "express";
import { apiConfig } from "../config";

// Per-IP rate limiting for the public API.
// Keeps the API free and open without letting one client monopolize it.

export function apiRateLimit(): RequestHandler {
  const opts: Partial<Options> = {
    // Sliding 60-second window.
    windowMs: 60 * 1000,
    // Limit comes from env so we can tune without a redeploy.
    limit: apiConfig.RATE_LIMIT_PER_MIN,
    // Use the draft-8 RateLimit-* headers (the modern standard).
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // Use the library's IP key generator so IPv6 buckets correctly
    // (raw req.ip varies on dual-stack hosts).
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
    handler: (req, res) => {
      // Custom handler so the JSON shape matches our error envelope.
      res.status(429).json({
        error: {
          code: "rate_limited",
          message: `Rate limit exceeded (${apiConfig.RATE_LIMIT_PER_MIN}/min). Try again shortly.`,
          id: req.id,
        },
      });
    },
  };
  return rateLimit(opts);
}
