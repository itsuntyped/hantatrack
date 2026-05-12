import { getLocationAggregates, getMetadata } from "./case-store";
import { getNews } from "./news-store";
import type { SSRData } from "../../../lib/ssr-context";
import { createLogger } from "../../scraper/logger";

// Builds the SSR payload for the home page.
// Each underlying call is wrapped in `.catch()` so a single failing source
// degrades that field to a safe default rather than failing the whole render —
// users always get a page, even if the data layer is sick.

const log = createLogger("api.page-data");

export async function loadHomeSSRData(): Promise<SSRData> {
  // Parallel fetch — all three sources are independent.
  const [locations, meta, news] = await Promise.all([
    getLocationAggregates().catch((err: unknown) => {
      // Log loudly: missing locations means a blank map.
      log.warn(`SSR locations load failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }),
    // Meta failure is silent — the UI handles `null` gracefully.
    getMetadata().catch(() => null),
    // News failure is silent — the ticker just stays empty.
    getNews().catch(() => []),
  ]);

  return { locations, meta, news };
}
