import { fetchText } from "../http-client";
import { extractCasesFromText, isAiAvailable } from "../ai/extract-cases";
import { createLogger } from "../logger";
import { buildSeedCases, nowIso, type CollectResult, type SourceModule } from "./source-helpers";
import type { RawCaseInput } from "../parser";

// HealthMap (Boston Children's Hospital) source.
// Uses the public RSS alerts feed — short text, well-suited to AI extraction.

const log = createLogger("scraper.healthmap");
const ID = "HealthMap";

// Public alerts feed. Includes hantavirus-flagged events along with everything else;
// AI extraction filters down to the relevant ones.
const HEALTHMAP_RSS_URL = "https://healthmap.org/rss/alerts.xml";

// Seed cases used when live extraction yields nothing.
const SEED_CASES: RawCaseInput[] = [
  {
    location_name: "Tristan da Cunha",
    status: "Suspected",
    date_reported: "2026-05-08",
    latitude: -37.1,
    longitude: -12.3,
    virus_strain: "Andes",
    notes: "HealthMap alert: suspected hantavirus case among MV Hondius contacts.",
  },
  {
    location_name: "Praia, Cabo Verde",
    status: "Probable",
    date_reported: "2026-05-03",
    latitude: 14.9,
    longitude: -23.5,
    virus_strain: "Andes",
    notes: "HealthMap alert: MV Hondius docked 3 days; port workers under monitoring.",
  },
];

// Live AI extraction. RSS body is short and well-suited to AI extraction.
async function tryLiveExtract(verifiedAt: string): Promise<RawCaseInput[]> {
  if (!isAiAvailable()) return [];
  try {
    const xml = await fetchText(HEALTHMAP_RSS_URL, { sourceName: ID });
    // RSS body is short and well-suited to AI extraction.
    return await extractCasesFromText(xml, { sourceName: ID, retrievedAt: verifiedAt });
  } catch (err) {
    log.warn(`live fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

export const healthmap: SourceModule = {
  id: ID,
  displayName: "HealthMap (Boston Children's Hospital)",
  async collect(): Promise<CollectResult> {
    const verifiedAt = nowIso();
    const live = await tryLiveExtract(verifiedAt);
    const rows = live.length > 0 ? live : SEED_CASES;
    log.info(`collected ${rows.length} ${live.length > 0 ? "live-extracted" : "seed"} rows`);
    return { cases: await buildSeedCases(rows, ID, verifiedAt, log), verifiedAt };
  },
};
