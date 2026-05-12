import { fetchText } from "../http-client";
import { extractCasesFromText, isAiAvailable } from "../ai/extract-cases";
import { createLogger } from "../logger";
import { buildSeedCases, nowIso, type CollectResult, type SourceModule } from "./source-helpers";
import type { RawCaseInput } from "../parser";

// WHO Disease Outbreak News (DON) source.
// Live path: fetch the DON listing page and run it through AI extraction.
// Seed path: hand-curated cases used when the live path fails or AI is unavailable.

const log = createLogger("scraper.who");
const ID = "WHO";

// Landing page that aggregates DON publications. Specific DON IDs are
// linked from here.
const DON_PAGE_URL = "https://www.who.int/emergencies/disease-outbreak-news";

// Hand-curated seeds derived from DON 2026-DON600. Used when AI is disabled
// or the live page fetch fails. Citations live in `notes` so we keep
// provenance even on the seed path.
const SEED_CASES: RawCaseInput[] = [
  {
    location_name: "Ushuaia, Argentina",
    status: "Confirmed",
    date_reported: "2026-04-01",
    latitude: -54.8,
    longitude: -68.3,
    virus_strain: "Andes",
    notes:
      "MV Hondius voyage departure 1 Apr 2026. Andes virus exposure likely during shore excursion in Patagonia. WHO DON 2026-DON600.",
  },
  {
    location_name: "Saint Helena",
    status: "Confirmed",
    date_reported: "2026-04-24",
    latitude: -15.9,
    longitude: -5.7,
    virus_strain: "Andes",
    notes:
      "First ANDV death: Dutch passenger medically evacuated and died. WHO DON 2026-DON600.",
  },
  {
    location_name: "Johannesburg, South Africa",
    status: "Confirmed",
    date_reported: "2026-04-26",
    latitude: -26.2,
    longitude: 28.0,
    virus_strain: "Andes",
    notes: "NICD lab-confirmed 2 cases including 1 death. WHO DON 2026-DON600.",
  },
  {
    location_name: "Netherlands",
    status: "Confirmed",
    date_reported: "2026-05-08",
    latitude: 52.1,
    longitude: 5.3,
    virus_strain: "Andes",
    notes: "3 lab-confirmed Andes virus cases. WHO DON 2026-DON600.",
  },
  {
    location_name: "Zurich, Switzerland",
    status: "Confirmed",
    date_reported: "2026-05-08",
    latitude: 47.4,
    longitude: 8.5,
    virus_strain: "Andes",
    notes: "1 lab-confirmed Andes virus case post-disembarkation. WHO DON 2026-DON600.",
  },
  {
    location_name: "France",
    status: "Confirmed",
    date_reported: "2026-05-11",
    latitude: 46.2,
    longitude: 2.2,
    virus_strain: "Andes",
    notes: "French Health Minister confirmed positive test on 11 May 2026. WHO DON 2026-DON600.",
  },
  {
    location_name: "Tristan da Cunha",
    status: "Suspected",
    date_reported: "2026-05-08",
    latitude: -37.1,
    longitude: -12.3,
    virus_strain: "Andes",
    notes: "UKHSA reported suspected British case. WHO DON 2026-DON600.",
  },
  {
    location_name: "Italy",
    status: "Probable",
    date_reported: "2026-05-11",
    latitude: 41.9,
    longitude: 12.5,
    virus_strain: "Andes",
    notes:
      "4 individuals under active surveillance — connecting flight contacts. Italian Ministry of Health circular issued.",
  },
];

// Attempt live AI-driven extraction. Returns [] when AI isn't configured or
// the page fetch fails — callers then fall back to SEED_CASES.
async function tryLiveExtract(verifiedAt: string): Promise<RawCaseInput[]> {
  if (!isAiAvailable()) return [];
  try {
    const html = await fetchText(DON_PAGE_URL, { sourceName: ID });
    return await extractCasesFromText(html, { sourceName: ID, retrievedAt: verifiedAt });
  } catch (err) {
    log.warn(`live fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

export const who: SourceModule = {
  id: ID,
  displayName: "WHO Disease Outbreak News",
  async collect(): Promise<CollectResult> {
    const verifiedAt = nowIso();
    const live = await tryLiveExtract(verifiedAt);
    // Prefer live data when we got any; otherwise use the curated seed set.
    const rows = live.length > 0 ? live : SEED_CASES;
    log.info(`collected ${rows.length} ${live.length > 0 ? "live-extracted" : "seed"} rows`);
    return { cases: await buildSeedCases(rows, ID, verifiedAt, log), verifiedAt };
  },
};
