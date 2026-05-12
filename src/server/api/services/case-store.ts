import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { apiConfig } from "../config";
import { aggregateByCountry, aggregateByLocation } from "../../scraper/aggregator";
import { loadGeocodeCache, lookupGeocode } from "../../scraper/reverse-geocoder";
import { readGeoJsonFile } from "../../scraper/serializer";
import { createLogger } from "../../scraper/logger";
import type { Case } from "../../../shared/case";
import type { CountryCaseAggregate, LocationAggregate } from "../../../shared/case-aggregate";

// Case store — single source of truth for the API's view of the scraper output.
// Reads data/cases.geojson, caches it in memory, and invalidates the cache when
// the file's mtime changes. Aggregations are computed once per refresh and
// reused across requests.

const log = createLogger("api.case-store");

// Snapshot of everything derived from one mtime of the GeoJSON file.
interface CacheEntry {
  // File modification time used as the cache key.
  mtimeMs: number;
  cases: Case[];
  countries: CountryCaseAggregate[];
  locations: LocationAggregate[];
  generatedAt: string | null;
  loadedAt: string;
}

// Process-local cache. The API is single-process so a module-level let is fine.
let cache: CacheEntry | null = null;

// Resolve the data file relative to the cwd so a configured relative path works.
function casesPath(): string {
  return resolve(process.cwd(), apiConfig.SCRAPER_OUTPUT_PATH);
}

// Reload the dataset when the file's mtime changes; otherwise return the cache.
// A missing file produces an empty entry rather than throwing — the UI then
// renders an empty map instead of an error page.
async function loadIfStale(): Promise<CacheEntry> {
  const path = casesPath();
  let mtimeMs = 0;
  try {
    const s = await stat(path);
    mtimeMs = s.mtimeMs;
  } catch (err) {
    // ENOENT is expected on first boot before the scraper has run.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  // Cache hit — same mtime means same data, return without re-reading.
  if (cache && cache.mtimeMs === mtimeMs) return cache;

  // Cache miss — reload and re-aggregate.
  const { cases, generatedAt } = await readGeoJsonFile(path);
  const geocodeCache = await loadGeocodeCache();
  const countries = aggregateByCountry(cases);
  // Pass a closure so the aggregator can resolve coordinates -> place names
  // without depending on the geocoder module directly.
  const locations = aggregateByLocation(cases, (lat, lng) => lookupGeocode(geocodeCache, lat, lng));
  cache = {
    mtimeMs,
    cases,
    countries,
    locations,
    generatedAt,
    loadedAt: new Date().toISOString(),
  };
  log.info(
    `Loaded ${cases.length} cases (${countries.length} countries, ${locations.length} locations) from ${path}`,
  );
  return cache;
}

// Public accessors below. Each calls loadIfStale so the cache stays current
// regardless of which accessor is invoked first.

export async function getAllCases(): Promise<Case[]> {
  const entry = await loadIfStale();
  return entry.cases;
}

export async function getCountryAggregates(): Promise<CountryCaseAggregate[]> {
  const entry = await loadIfStale();
  return entry.countries;
}

export async function getLocationAggregates(): Promise<LocationAggregate[]> {
  const entry = await loadIfStale();
  return entry.locations;
}

// Combined metadata block used by the summary endpoint and the SSR payload.
export async function getMetadata(): Promise<{
  totalCases: number;
  countries: number;
  locations: number;
  generatedAt: string | null;
  loadedAt: string;
}> {
  const entry = await loadIfStale();
  return {
    totalCases: entry.cases.length,
    countries: entry.countries.length,
    locations: entry.locations.length,
    generatedAt: entry.generatedAt,
    loadedAt: entry.loadedAt,
  };
}
