import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { apiConfig } from "../config";
import { createLogger } from "../../scraper/logger";
import type { NewsArticle } from "../../../shared/news";

// News store — mtime-cached reader for the news.json file written by the
// scraper. Mirrors case-store.ts in structure but reads a much smaller file.

const log = createLogger("api.news-store");

// One cached snapshot per mtime.
interface CacheEntry {
  mtimeMs: number;
  articles: NewsArticle[];
  loadedAt: string;
}

let cache: CacheEntry | null = null;

// News file lives next to the GeoJSON file (same data/ directory).
function newsPath(): string {
  return resolve(process.cwd(), dirname(apiConfig.SCRAPER_OUTPUT_PATH), "news.json");
}

// Reload when the file's mtime changes. Missing or malformed files degrade
// gracefully to an empty article list rather than throwing.
async function loadIfStale(): Promise<CacheEntry> {
  const path = newsPath();
  let mtimeMs = 0;
  try {
    const s = await stat(path);
    mtimeMs = s.mtimeMs;
  } catch (err) {
    // ENOENT is expected before the scraper has run.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  // Cache hit.
  if (cache && cache.mtimeMs === mtimeMs) return cache;

  let articles: NewsArticle[] = [];
  try {
    const raw = await readFile(path, "utf8");
    const data = JSON.parse(raw) as { data?: NewsArticle[] };
    // Defensive: only accept arrays — log and continue on shape drift.
    articles = Array.isArray(data.data) ? data.data : [];
  } catch (err) {
    // Don't swallow read errors silently except for the expected ENOENT.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      log.warn(`news read failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  cache = {
    mtimeMs,
    articles,
    loadedAt: new Date().toISOString(),
  };
  log.info(`Loaded ${articles.length} news articles from ${path}`);
  return cache;
}

export async function getNews(): Promise<NewsArticle[]> {
  const entry = await loadIfStale();
  return entry.articles;
}
