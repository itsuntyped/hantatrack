import { fetchText } from "../http-client";
import { extractCasesFromText, isAiAvailable } from "../ai/extract-cases";
import { createLogger } from "../logger";
import { buildSeedCases, nowIso, type CollectResult, type SourceModule } from "./source-helpers";
import type { RawCaseInput } from "../parser";

// ECDC source — European Centre for Disease Prevention and Control.
// Same live-AI + seed-fallback pattern as the other agency sources.

const log = createLogger("scraper.ecdc");
const ID = "ECDC";

// Outbreak-specific surveillance page.
const ECDC_URL =
  "https://www.ecdc.europa.eu/en/infectious-disease-topics/hantavirus-infection/surveillance-and-updates/andes-hantavirus-outbreak";

// Seeds derived from ECDC rapid risk assessment, 10 May 2026.
const SEED_CASES: RawCaseInput[] = [
  {
    location_name: "MV Hondius",
    status: "Confirmed",
    date_reported: "2026-05-02",
    latitude: 28.1,
    longitude: -15.4,
    virus_strain: "Andes",
    notes:
      "ECDC notified 2 May 2026 via EU EWRS. Cluster of 6 confirmed + 2 probable cases. ECDC rapid risk assessment, 10 May 2026.",
  },
  {
    location_name: "Netherlands",
    status: "Confirmed",
    date_reported: "2026-05-08",
    latitude: 52.1,
    longitude: 5.3,
    virus_strain: "Andes",
    notes: "Dutch passengers among confirmed fatalities. ECDC rapid risk assessment.",
  },
  {
    location_name: "Germany",
    status: "Confirmed",
    date_reported: "2026-05-08",
    latitude: 51.2,
    longitude: 10.5,
    virus_strain: "Andes",
    notes: "German nationals confirmed. ECDC rapid risk assessment.",
  },
  {
    location_name: "Finland",
    status: "Probable",
    date_reported: "2026-05-09",
    latitude: 61.9,
    longitude: 25.7,
    virus_strain: "Andes",
    notes: "Finnish contacts under monitoring. ECDC rapid risk assessment.",
  },
  {
    location_name: "Sweden",
    status: "Probable",
    date_reported: "2026-05-09",
    latitude: 59.3,
    longitude: 18.1,
    virus_strain: "Andes",
    notes: "Swedish contacts under monitoring. ECDC rapid risk assessment.",
  },
];

// Live AI extraction. Same fall-through behaviour as the other agency sources.
async function tryLiveExtract(verifiedAt: string): Promise<RawCaseInput[]> {
  if (!isAiAvailable()) return [];
  try {
    const html = await fetchText(ECDC_URL, { sourceName: ID });
    return await extractCasesFromText(html, { sourceName: ID, retrievedAt: verifiedAt });
  } catch (err) {
    log.warn(`live fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

export const ecdc: SourceModule = {
  id: ID,
  displayName: "European Centre for Disease Prevention and Control",
  async collect(): Promise<CollectResult> {
    const verifiedAt = nowIso();
    const live = await tryLiveExtract(verifiedAt);
    const rows = live.length > 0 ? live : SEED_CASES;
    log.info(`collected ${rows.length} ${live.length > 0 ? "live-extracted" : "seed"} rows`);
    return { cases: await buildSeedCases(rows, ID, verifiedAt, log), verifiedAt };
  },
};
