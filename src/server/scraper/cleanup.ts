import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { config } from "./config";
import { createLogger } from "./logger";
import { inspectPersistedRow } from "./ai/plausibility";

// Offline cleanup.
//
// This is a one-shot script — `npm run scraper:cleanup` — that re-validates
// every row already in `data/cases.geojson` against the same hallucination
// rules the live scraper now applies to fresh AI output. Rows that fail are
// removed, and any geocode-cache entries that exist only because of those
// rows are removed alongside them. Existing rows that pass are left
// untouched.
//
// Why this exists: the live filter only runs on *new* rows, and the merge
// step is additive. A bad row that landed in the file before the filter
// existed cannot be removed by the live pipeline. This script closes that
// gap. Run it once after pulling the hardened scraper code into an
// environment whose dataset pre-dates that change.

const log = createLogger("scraper.cleanup");

// GeoJSON shapes — kept local to avoid pulling in the runtime serializer's
// types, which would couple this script to its read/write helpers.
interface GeoJsonFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    case_id: string;
    native_id?: string;
    status: string;
    date_reported: string;
    source: string;
    latitude: number;
    longitude: number;
    location_name: string;
    virus_strain: string;
    source_verified_at: string;
    notes: string;
  };
}

interface GeoJsonCollection {
  type: "FeatureCollection";
  metadata?: Record<string, unknown>;
  features: GeoJsonFeature[];
}

// Geocode-cache shape (mirrors reverse-geocoder.ts CacheFile but loosened).
interface GeocodeCache {
  version: number;
  entries: Record<string, unknown>;
  forward?: Record<string, unknown>;
}

interface Verdict {
  keep: boolean;
  reasons: string[];
}

// Apply plausibility rules to a persisted feature. Thin adapter around
// `inspectPersistedRow` (the shared inspector in ai/plausibility.ts) — keeping
// the rule logic in one place means the live post-merge filter and this
// offline script can never drift apart.
function inspect(f: GeoJsonFeature): Verdict {
  const p = f.properties;
  const issues = inspectPersistedRow({
    source: p.source,
    locationName: p.location_name,
    notes: p.notes,
  });
  return {
    keep: issues.length === 0,
    reasons: issues.map((i) => `${i.field}: ${i.message}`),
  };
}

// Result handed back to the CLI for human-readable logging.
export interface CleanupResult {
  geojsonPath: string;
  cachePath: string;
  totalBefore: number;
  kept: number;
  dropped: number;
  droppedDetails: Array<{
    case_id: string;
    location_name: string;
    source: string;
    reasons: string[];
  }>;
  forwardEntriesDropped: number;
  reverseEntriesDropped: number;
  dryRun: boolean;
}

// Same coord bucket the reverse-geocoder uses — 2 decimals ≈ 1 km.
function coordBucket(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

// Run the cleanup. `dryRun: true` skips writes and just reports what would change.
export async function runCleanup(options: { dryRun?: boolean } = {}): Promise<CleanupResult> {
  const dryRun = options.dryRun === true;
  const geojsonPath = resolve(process.cwd(), config.SCRAPER_OUTPUT_PATH);
  const cachePath = resolve(
    process.cwd(),
    dirname(config.SCRAPER_OUTPUT_PATH),
    "geocode-cache.json",
  );

  log.info(`=== cleanup ${dryRun ? "(dry-run) " : ""}started ===`);
  log.info(`geojson: ${geojsonPath}`);
  log.info(`cache:   ${cachePath}`);

  // Cases.
  const geojsonRaw = await readFile(geojsonPath, "utf8");
  const data = JSON.parse(geojsonRaw) as GeoJsonCollection;
  if (!Array.isArray(data.features)) {
    throw new Error("cases.geojson has no features array");
  }
  const totalBefore = data.features.length;

  const kept: GeoJsonFeature[] = [];
  const dropped: GeoJsonFeature[] = [];
  const droppedDetails: CleanupResult["droppedDetails"] = [];
  for (const f of data.features) {
    const v = inspect(f);
    if (v.keep) {
      kept.push(f);
    } else {
      dropped.push(f);
      const detail = {
        case_id: f.properties.case_id,
        location_name: f.properties.location_name,
        source: f.properties.source,
        reasons: v.reasons,
      };
      droppedDetails.push(detail);
      log.warn(
        `DROP ${detail.case_id.slice(0, 12)} (${detail.source} "${detail.location_name}"): ${detail.reasons.join("; ")}`,
      );
    }
  }
  log.info(
    `features: ${totalBefore} total → ${kept.length} kept, ${dropped.length} dropped`,
  );

  // Geocode cache.
  let cache: GeocodeCache = { version: 1, entries: {}, forward: {} };
  let cacheExists = true;
  try {
    cache = JSON.parse(await readFile(cachePath, "utf8")) as GeocodeCache;
    if (!cache.entries) cache.entries = {};
    if (!cache.forward) cache.forward = {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      log.warn(`cache file missing — skipping cache cleanup`);
      cacheExists = false;
    } else {
      throw err;
    }
  }

  let forwardEntriesDropped = 0;
  let reverseEntriesDropped = 0;
  if (cacheExists) {
    // A forward entry is safe to drop only if no surviving case still
    // uses that name. Otherwise some legitimate row would lose its cache.
    const droppedNames = new Set(
      dropped.map((d) => d.properties.location_name.trim().toLowerCase()),
    );
    const keptNames = new Set(
      kept.map((k) => k.properties.location_name.trim().toLowerCase()),
    );
    for (const key of Object.keys(cache.forward ?? {})) {
      if (droppedNames.has(key) && !keptNames.has(key)) {
        delete cache.forward![key];
        forwardEntriesDropped++;
        log.info(`drop forward cache: "${key}"`);
      }
    }

    // Same idea for reverse entries: drop the bucket only if no surviving
    // case sits in it.
    const droppedBuckets = new Set(
      dropped.map((d) => coordBucket(d.properties.latitude, d.properties.longitude)),
    );
    const keptBuckets = new Set(
      kept.map((k) => coordBucket(k.properties.latitude, k.properties.longitude)),
    );
    for (const key of Object.keys(cache.entries)) {
      if (droppedBuckets.has(key) && !keptBuckets.has(key)) {
        delete cache.entries[key];
        reverseEntriesDropped++;
        log.info(`drop reverse cache: ${key}`);
      }
    }
  }

  // Persist (unless dry-run).
  if (!dryRun && dropped.length > 0) {
    data.features = kept;
    await writeFile(geojsonPath, JSON.stringify(data, null, 2) + "\n", "utf8");
    log.info(`wrote ${geojsonPath} (${kept.length} features)`);
  }
  if (!dryRun && cacheExists && (forwardEntriesDropped > 0 || reverseEntriesDropped > 0)) {
    await writeFile(cachePath, JSON.stringify(cache, null, 2) + "\n", "utf8");
    log.info(`wrote ${cachePath}`);
  }

  log.info(`=== cleanup ${dryRun ? "(dry-run) " : ""}done ===`);

  return {
    geojsonPath,
    cachePath,
    totalBefore,
    kept: kept.length,
    dropped: dropped.length,
    droppedDetails,
    forwardEntriesDropped,
    reverseEntriesDropped,
    dryRun,
  };
}
