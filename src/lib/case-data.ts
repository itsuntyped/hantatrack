import type { LocationAggregate } from "../shared/case-aggregate";

// Client-side fetcher for the location-aggregate dataset.
// Used after initial SSR load when the UI wants to re-fetch fresh data
// (e.g. when the user manually refreshes or after a long idle period).

// Caller-supplied options for cancellation via AbortController.
export interface FetchOptions {
  signal?: AbortSignal;
}

// Wire shape returned by /api/v1/summary; we strip it down to LocationsResult below.
interface SummaryResponse<T> {
  groupBy: "country" | "location";
  data: T[];
  meta: {
    totalCases: number;
    countries: number;
    locations: number;
    generatedAt: string | null;
    loadedAt: string;
  };
}

// Public result shape returned to callers — the data + meta they care about.
export interface LocationsResult {
  locations: LocationAggregate[];
  meta: SummaryResponse<LocationAggregate>["meta"];
}

// Backoff schedule for transient failures. Length also controls retry count.
const RETRY_BACKOFF_MS = [250, 500, 1000];

// Treat `TypeError` from `fetch` as a transient network-layer failure
// (DNS hiccup, connection reset, etc.) — anything else propagates.
function isTransient(err: unknown): boolean {
  return err instanceof TypeError;
}

// Fetch with retry/backoff on 5xx and transient network errors.
// Aborts immediately when the caller's AbortSignal fires so we don't
// keep retrying a cancelled request.
async function fetchWithRetry(url: string, signal?: AbortSignal): Promise<Response> {
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    try {
      const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
      // Retry 5xx responses; pass through 4xx and 2xx unchanged.
      if (res.status >= 500 && res.status < 600 && attempt < RETRY_BACKOFF_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt]));
        continue;
      }
      return res;
    } catch (err) {
      // Always honor cancellation — don't retry an aborted request.
      if (signal?.aborted) throw err;
      // Only retry transient errors; bubble everything else up.
      if (!isTransient(err) || attempt >= RETRY_BACKOFF_MS.length) throw err;
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt]));
    }
  }
  // Unreachable — the loop above either returns or throws.
  throw new Error("fetchWithRetry: exhausted retries");
}

// Public entry point — fetch the location-grouped summary.
export async function fetchLocationAggregates(
  options: FetchOptions = {},
): Promise<LocationsResult> {
  const url = `/api/v1/summary?groupBy=location`;
  const res = await fetchWithRetry(url, options.signal);
  if (!res.ok) {
    throw new Error(`Location fetch failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as SummaryResponse<LocationAggregate>;
  return { locations: body.data, meta: body.meta };
}
