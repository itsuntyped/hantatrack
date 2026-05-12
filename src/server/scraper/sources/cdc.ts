import { fetchText } from "../http-client";
import { extractCasesFromText, isAiAvailable } from "../ai/extract-cases";
import { createLogger } from "../logger";
import { buildSeedCases, nowIso, type CollectResult, type SourceModule } from "./source-helpers";
import type { RawCaseInput } from "../parser";

// U.S. CDC Health Alert Network (HAN) source.
// Mirrors who.ts in structure: live AI-extracted from the HAN bulletin URL,
// with hand-curated seeds as fallback.

const log = createLogger("scraper.cdc");
const ID = "CDC";

// HAN bulletin specific to the 2026 ANDV outbreak.
const CDC_HAN_URL = "https://www.cdc.gov/han/php/notices/han00528.html";

// Seed cases sourced from HAN-00528. Citations live in notes for provenance.
const SEED_CASES: RawCaseInput[] = [
  {
    location_name: "Ushuaia, Argentina",
    status: "Confirmed",
    date_reported: "2026-04-01",
    latitude: -54.8,
    longitude: -68.3,
    virus_strain: "Andes",
    notes: "MV Hondius departed Ushuaia 1 April 2026. CDC HAN-00528.",
  },
  {
    location_name: "Saint Helena",
    status: "Confirmed",
    date_reported: "2026-04-24",
    latitude: -15.9,
    longitude: -5.7,
    virus_strain: "Andes",
    notes: "First fatality removed from MV Hondius at Saint Helena. CDC HAN-00528.",
  },
  {
    location_name: "Johannesburg, South Africa",
    status: "Confirmed",
    date_reported: "2026-04-26",
    latitude: -26.2,
    longitude: 28.0,
    virus_strain: "Andes",
    notes: "Second fatality plus British passenger in critical condition. CDC HAN-00528.",
  },
  {
    location_name: "Tenerife, Canary Islands, Spain",
    status: "Confirmed",
    date_reported: "2026-05-10",
    latitude: 28.1,
    longitude: -15.4,
    virus_strain: "Andes",
    notes:
      "CDC team deployed 7 May 2026. 17 Americans repatriated to Nebraska facility. Level 3 emergency response. CDC HAN-00528.",
  },
  {
    location_name: "Nebraska, United States",
    status: "Suspected",
    date_reported: "2026-05-10",
    latitude: 41.5,
    longitude: -99.9,
    virus_strain: "Andes",
    notes: "17 American passengers repatriated to Nebraska Medicine National Quarantine Unit. CDC HAN-00528.",
  },
];

// Live AI extraction. Same pattern as who.ts.
async function tryLiveExtract(verifiedAt: string): Promise<RawCaseInput[]> {
  if (!isAiAvailable()) return [];
  try {
    const html = await fetchText(CDC_HAN_URL, { sourceName: ID });
    return await extractCasesFromText(html, { sourceName: ID, retrievedAt: verifiedAt });
  } catch (err) {
    log.warn(`live fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

export const cdc: SourceModule = {
  id: ID,
  displayName: "U.S. CDC Health Alert Network",
  async collect(): Promise<CollectResult> {
    const verifiedAt = nowIso();
    const live = await tryLiveExtract(verifiedAt);
    // Fall back to seeds when live extraction yields nothing.
    const rows = live.length > 0 ? live : SEED_CASES;
    log.info(`collected ${rows.length} ${live.length > 0 ? "live-extracted" : "seed"} rows`);
    return { cases: await buildSeedCases(rows, ID, verifiedAt, log), verifiedAt };
  },
};
