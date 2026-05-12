import "dotenv/config";
import { z } from "zod";

// Scraper-side environment configuration.
// Separate from the API config so the worker can run with only the env it needs.

const schema = z.object({
  // Optional — when missing, AI extraction silently no-ops (see ai/extract-cases.ts).
  OPENAI_API_KEY: z.string().optional(),
  // Model id. gpt-4o-mini is the working default — cheap and structured-output friendly.
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  // How often the worker loop fires (minutes).
  SCRAPER_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  // Per-request HTTP timeout for outbound source fetches (ms).
  SCRAPER_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  // Where to write the merged dataset.
  SCRAPER_OUTPUT_PATH: z.string().default("data/cases.geojson"),
});

// Parse once at import time so we fail fast on misconfiguration.
export const config = schema.parse(process.env);
export type ScraperConfig = typeof config;
