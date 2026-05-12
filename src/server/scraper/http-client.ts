import { USER_AGENT } from "./constants";
import { config } from "./config";
import { createLogger } from "./logger";

// Tiny HTTP client wrapping `fetch` with timeouts and retry/backoff.
// Every outbound scraper call routes through this so we have consistent
// timeouts and a single place to add observability.

const log = createLogger("scraper.http");

// 3 attempts total — first try + 2 retries.
const MAX_RETRIES = 3;
// Exponential-ish backoff between attempts (ms).
const BACKOFF_MS = [1000, 2000, 4000];

export interface FetchOptions {
  // Source identifier used purely for log lines so retries are traceable.
  sourceName: string;
  // Per-request override; defaults to the configured global timeout.
  timeoutMs?: number;
  // Send `Accept: application/json` when true.
  acceptJson?: boolean;
}

// Core retry loop. Uses AbortController to enforce per-attempt timeouts.
async function fetchWithRetry(url: string, opts: FetchOptions): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? config.SCRAPER_FETCH_TIMEOUT_MS;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    // Schedule abort on timeout; cleared as soon as the request resolves.
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          // Slight preference for JSON when we ask for it, otherwise be liberal.
          Accept: opts.acceptJson ? "application/json" : "text/html,application/json;q=0.9,*/*;q=0.5",
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      // Non-2xx is treated as failure here so callers don't need to re-check.
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      log.warn(
        `[${opts.sourceName}] attempt ${attempt}/${MAX_RETRIES} failed for ${url}: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Backoff before the next attempt, but not after the final one.
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1]));
      }
    }
  }
  // Re-throw the last error so callers see a meaningful root cause.
  throw lastError instanceof Error ? lastError : new Error(`fetch failed: ${String(lastError)}`);
}

// Plain-text variant. Used by HTML/RSS sources.
export async function fetchText(url: string, opts: FetchOptions): Promise<string> {
  const res = await fetchWithRetry(url, opts);
  return res.text();
}

// JSON variant. Generic so callers can specify the expected payload shape.
export async function fetchJson<T = unknown>(url: string, opts: FetchOptions): Promise<T> {
  const res = await fetchWithRetry(url, { ...opts, acceptJson: true });
  return (await res.json()) as T;
}
