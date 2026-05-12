import { randomBytes } from "node:crypto";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { apiConfig, corsAllowedOrigins } from "../config";

// Security middleware bundle: CSP nonce, helmet (security headers), and CORS.

// Extend Express's Locals so res.locals.cspNonce is typed everywhere.
declare module "express-serve-static-core" {
  interface Locals {
    cspNonce?: string;
  }
}

// Mint a fresh nonce per request. helmet reads this value to build a
// per-request `script-src 'nonce-…'` directive; the SSR template injects the
// same value into the hydration <script> tag.
export function cspNonce(_req: Request, res: Response, next: NextFunction): void {
  res.locals.cspNonce = randomBytes(16).toString("base64");
  next();
}

// CARTO tile CDN origins — must be allowed in img-src so map tiles load.
// CARTO uses 4 subdomains for tile sharding; whitelist all of them.
const TILE_ORIGINS = [
  "https://a.basemaps.cartocdn.com",
  "https://b.basemaps.cartocdn.com",
  "https://c.basemaps.cartocdn.com",
  "https://d.basemaps.cartocdn.com",
];

export function helmetMiddleware(): RequestHandler {
  const isDev = apiConfig.NODE_ENV !== "production";

  // Vite's dev client injects inline <script> blocks for HMR and uses
  // eval() under the hood, so dev needs 'unsafe-inline' + 'unsafe-eval'.
  // Prod relies on a per-request nonce for the SSR hydration payload.
  const nonce = (_req: unknown, res: unknown): string => {
    const r = res as Response;
    return `'nonce-${r.locals.cspNonce ?? ""}'`;
  };

  // Build the script-src list dynamically per environment.
  const scriptSrc = isDev
    ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
    : ["'self'", nonce];

  // Leaflet sets inline styles on tile elements (transform/width/etc).
  const styleSrc = ["'self'", "'unsafe-inline'"];
  // Allow WebSocket connections in dev for HMR.
  const connectSrc = ["'self'", ...(isDev ? ["ws:", "wss:"] : [])];

  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc,
        styleSrc,
        // data:/blob: allowed for Leaflet's marker images and zoom thumbs.
        imgSrc: ["'self'", "data:", "blob:", ...TILE_ORIGINS],
        connectSrc,
        fontSrc: ["'self'", "data:"],
        // Refuse embedding in iframes — defense against clickjacking.
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    // COEP off because we don't ship cross-origin isolated features yet and
    // it would block third-party tile loads.
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  });
}

// CORS for the site routes (public API).
// Only origins in the env-configured allowlist are permitted; same-origin
// requests (which arrive with no Origin header) are always allowed.
export function siteCors(): RequestHandler {
  const opts: CorsOptions = {
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      cb(null, corsAllowedOrigins.includes(origin));
    },
    // Read-only API — no need to allow mutation verbs.
    methods: ["GET", "HEAD", "OPTIONS"],
    // 10 minute preflight cache.
    maxAge: 600,
  };
  return cors(opts);
}
