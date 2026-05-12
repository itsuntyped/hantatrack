import { resolve } from "node:path";
import pLimit from "p-limit";
import { config } from "./config";
import { createLogger } from "./logger";
import { SOURCES } from "./sources";
import { validateCase } from "./validator";
import { mergeWithExisting } from "./deduplicator";
import { readExistingCases, writeGeoJson } from "./serializer";
import { reverseGeocodePoints } from "./reverse-geocoder";
import { runNewsScrape } from "./news";
import type { Case, SourceRunStats } from "../../shared/case";

// Scrape orchestrator. Runs every source in parallel, validates + dedups the
// combined result against the existing dataset, writes the merged GeoJSON
// file, and updates the geocode cache and news file.

const log = createLogger("scraper");

// Reported back to the caller (CLI and worker loop) — useful for logs and metrics.
export interface ScrapeRunResult {
  total: number;
  newValid: number;
  invalid: number;
  durationMs: number;
  outputPath: string;
  sourceStats: Record<string, SourceRunStats>;
}

// 6 concurrent source fetches — bounded so we don't open hundreds of sockets.
const SOURCE_CONCURRENCY = 6;

export async function runScrape(): Promise<ScrapeRunResult> {
  const start = Date.now();
  const outputPath = resolve(process.cwd(), config.SCRAPER_OUTPUT_PATH);
  log.info(`=== HantaTrack scrape started — output: ${outputPath} ===`);

  // Carry forward whatever's already on disk so we keep history across runs.
  const existing = await readExistingCases(outputPath);
  log.info(`Loaded ${existing.length} existing cases.`);

  const sourceStats: Record<string, SourceRunStats> = {};
  const limit = pLimit(SOURCE_CONCURRENCY);

  // Collect each source's cases. One failing source must not block others.
  const collected: Case[] = [];
  await Promise.all(
    SOURCES.map((source) =>
      limit(async () => {
        try {
          const { cases, verifiedAt } = await source.collect();
          sourceStats[source.id] = {
            status: "ok",
            casesCollected: cases.length,
            verifiedAt,
          };
          collected.push(...cases);
          log.info(`[${source.id}] ok — ${cases.length} cases`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          sourceStats[source.id] = { status: "error", error: message };
          log.error(`[${source.id}] failed: ${message}`);
        }
      }),
    ),
  );

  // Validate every collected case; reject the bad ones with a logged reason.
  const valid: Case[] = [];
  let invalid = 0;
  for (const c of collected) {
    const errs = validateCase(c);
    if (errs.length === 0) valid.push(c);
    else {
      invalid++;
      log.warn(`invalid case (${c.caseId.slice(0, 12)} ${c.locationName}): ${errs.join("; ")}`);
    }
  }

  // Merge new with existing under the dedup policy — newest+most-severe wins.
  const merged = mergeWithExisting(valid, existing);
  log.info(
    `merged: ${merged.length} total (existing ${existing.length}, new valid ${valid.length}, invalid ${invalid})`,
  );

  await writeGeoJson(merged, sourceStats, outputPath);

  // Reverse-geocode any new (lat,lng) pairs so the API can label them
  // as "City, Region, Country" instead of the source's bland "CANADA"/"USA".
  // Results are cached on disk; only new points incur a Nominatim request.
  await reverseGeocodePoints(merged.map((c) => ({ lat: c.latitude, lng: c.longitude })));

  // News ticker — pull recent hantavirus headlines from Google News RSS.
  // Failures here don't fail the run; the front-end will fall back to "no news".
  try {
    await runNewsScrape();
  } catch (err) {
    log.warn(`news scrape failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const durationMs = Date.now() - start;
  log.info(`=== scrape done in ${durationMs}ms — ${merged.length} cases written ===`);

  return {
    total: merged.length,
    newValid: valid.length,
    invalid,
    durationMs,
    outputPath,
    sourceStats,
  };
}

