import "dotenv/config";
import { z } from "zod";

// Server-side environment configuration.
// All env vars are parsed and validated here so the rest of the API can rely
// on typed values without re-checking. Failure to validate aborts startup.

// zod schema — defaults make the dev experience friction-free (just `npm run dev`)
// while production deployments can override via real env vars.
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // Coerce because env vars are always strings.
  PORT: z.coerce.number().int().positive().default(8080),
  // Comma-separated origin allowlist for the site routes; defaults cover the
  // Vite dev server ports we hand out in `npm run dev`.
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:5173,http://localhost:5174,http://localhost:5175"),
  // Per-IP requests per minute on the public API.
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(60),
  // Whether to honor X-Forwarded-* headers. Only enable behind a known proxy.
  TRUST_PROXY: z
    .union([z.literal("true"), z.literal("false")])
    .default("false")
    .transform((v) => v === "true"),
  // Where the scraper writes its output; the case-store reads from this path.
  SCRAPER_OUTPUT_PATH: z.string().default("data/cases.geojson"),
});

// Parse `process.env` once at import time. Throws if validation fails.
export const apiConfig = schema.parse(process.env);

// Split the comma-separated origins into a usable allowlist.
// Trim per item and drop blanks so a trailing comma doesn't whitelist `""`.
export const corsAllowedOrigins = apiConfig.CORS_ALLOWED_ORIGINS.split(",")
  .map((o) => o.trim())
  .filter((o) => o.length > 0);

export type ApiConfig = typeof apiConfig;
