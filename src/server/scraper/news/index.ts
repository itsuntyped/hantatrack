import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { config } from "../config";
import { createLogger } from "../logger";
import { collectGoogleNews } from "./google-news";
import type { NewsArticle } from "../../../shared/news";

// News orchestrator.
// Reads previously stored articles, merges in fresh ones from the collectors,
// prunes stale entries, and writes the result to news.json next to the
// case GeoJSON file.

const log = createLogger("scraper.news");

// Retention policy. Articles older than this are dropped on each run so the
// ticker never carries headlines from last month.
const MAX_AGE_DAYS = 14;
// Hard cap on rows persisted, regardless of how many fresh items arrived.
const MAX_KEEP = 60;

// File lives next to the GeoJSON output — same directory, same lifecycle.
function newsPath(): string {
  return resolve(process.cwd(), dirname(config.SCRAPER_OUTPUT_PATH), "news.json");
}

// Read the previous run's articles. Missing/corrupt file degrades to empty
// rather than failing the merge.
async function readExisting(): Promise<NewsArticle[]> {
  try {
    const raw = await readFile(newsPath(), "utf8");
    const data = JSON.parse(raw) as { data: NewsArticle[] };
    return Array.isArray(data.data) ? data.data : [];
  } catch (err) {
    // ENOENT is expected on first run.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      log.warn(`existing news read failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return [];
  }
}

// Merge by id (incoming wins on conflict so titles/pubDates can be corrected),
// drop articles older than MAX_AGE_DAYS, sort newest-first, cap at MAX_KEEP.
function mergeAndPrune(existing: NewsArticle[], incoming: NewsArticle[]): NewsArticle[] {
  const byId = new Map<string, NewsArticle>();
  for (const a of existing) byId.set(a.id, a);
  // Incoming entries overwrite existing because they're presumably fresher
  // and may carry corrected metadata.
  for (const a of incoming) byId.set(a.id, a);

  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const filtered = [...byId.values()].filter((a) => {
    const t = Date.parse(a.publishedAt);
    // Drop unparseable dates too — better than carrying a "?" entry forever.
    return Number.isFinite(t) && t >= cutoff;
  });
  // Newest first; UI renders left-to-right starting from the most recent.
  filtered.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  return filtered.slice(0, MAX_KEEP);
}

// Entry point. Called from the scraper orchestrator after the case run.
// Returns counts so the orchestrator can include them in its summary log.
export async function runNewsScrape(): Promise<{ total: number; fresh: number }> {
  const existing = await readExisting();
  const incoming = await collectGoogleNews();
  const merged = mergeAndPrune(existing, incoming);

  const path = newsPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        data: merged,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  log.info(`wrote ${merged.length} news articles (${incoming.length} fresh) → ${path}`);
  return { total: merged.length, fresh: incoming.length };
}
