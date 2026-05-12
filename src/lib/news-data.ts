import type { NewsArticle } from "../shared/news";

// Client-side fetcher for the news ticker.
// Mirrors lib/case-data.ts but targets /api/v1/news; same retry/backoff strategy.

// Caller-supplied options for cancellation.
export interface FetchNewsOptions {
  signal?: AbortSignal;
}

// Wire shape returned by /api/v1/news.
interface NewsResponse {
  data: NewsArticle[];
  meta: { total: number };
}

// Backoff schedule for transient failures. Length controls retry count.
const RETRY_BACKOFF_MS = [250, 500, 1000];

// Treat `TypeError` from `fetch` as a transient network-layer failure.
function isTransient(err: unknown): boolean {
  return err instanceof TypeError;
}

// Fetch with retry/backoff on 5xx and transient network errors. See lib/case-data.ts.
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
      if (!isTransient(err) || attempt >= RETRY_BACKOFF_MS.length) throw err;
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt]));
    }
  }
  // Unreachable — the loop above either returns or throws.
  throw new Error("fetchWithRetry: exhausted retries");
}

// Public entry point — fetch the latest news articles for the ticker.
// `limit=30` caps the payload on the wire; the server further trims to its own ceiling.
export async function fetchNews(options: FetchNewsOptions = {}): Promise<NewsArticle[]> {
  const url = `/api/v1/news?limit=30`;
  const res = await fetchWithRetry(url, options.signal);
  if (!res.ok) {
    throw new Error(`News fetch failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as NewsResponse;
  return body.data;
}
