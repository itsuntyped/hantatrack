import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { USER_AGENT } from "./constants";
import { createLogger } from "./logger";
import { config } from "./config";

// Reverse + forward geocoding wrapper for OSM Nominatim.
// Cache everything to disk so we don't re-ask Nominatim for the same point.
// All network calls go through a shared queue that enforces Nominatim's
// rate-limit policy (no more than ~1 request per second, shared across types).

const log = createLogger("scraper.geocode");

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
// OSM Nominatim policy: ≤ 1 req/sec — leave a little headroom so we never get banned.
const RATE_LIMIT_MS = 1100;
// 90 days. Place names rarely change; this keeps the cache useful between deploys.
const TTL_MS = 90 * 24 * 60 * 60 * 1000;
// 2 decimal places ≈ 1 km bucket — matches LocationAggregate bucketing in aggregator.ts.
const COORD_PRECISION = 2;

// Normalized reverse-geocode result, persisted to the cache file.
export interface GeoLabel {
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  displayName?: string;
  fetchedAt: string;
}

// Forward-geocode result.
export interface GeoCoord {
  lat: number;
  lng: number;
  displayName?: string;
  fetchedAt: string;
}

// On-disk shape. Versioned so we can migrate when the schema changes.
interface CacheFile {
  version: 1;
  entries: Record<string, GeoLabel>;
  forward?: Record<string, GeoCoord>;
}

// Cache file lives next to the GeoJSON output.
function cachePath(): string {
  return resolve(process.cwd(), dirname(config.SCRAPER_OUTPUT_PATH), "geocode-cache.json");
}

// Bucketed coordinate key (string form).
function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(COORD_PRECISION)},${lng.toFixed(COORD_PRECISION)}`;
}

// Normalize free-text place strings so "Paris, France" and "paris, france "
// share a cache entry.
function normalizePlace(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

// In-memory mirror so repeated lookups in one run don't hit disk.
let memoryCache: CacheFile | null = null;

// Lazy load; returns an empty cache when the file is missing or malformed.
async function readCache(): Promise<CacheFile> {
  if (memoryCache) return memoryCache;
  try {
    const raw = await readFile(cachePath(), "utf8");
    const data = JSON.parse(raw) as CacheFile;
    if (data.version === 1 && data.entries) {
      memoryCache = { version: 1, entries: data.entries, forward: data.forward ?? {} };
      return memoryCache;
    }
  } catch (err) {
    // ENOENT is expected on first run — anything else is logged.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      log.warn(`cache read failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  memoryCache = { version: 1, entries: {}, forward: {} };
  return memoryCache;
}

// Persist the cache. Creates the parent directory if needed.
async function writeCache(cache: CacheFile): Promise<void> {
  const path = cachePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cache, null, 2) + "\n", "utf8");
}

// TTL check used to know when to refresh a cached entry.
function isFresh(fetchedAt: string): boolean {
  const fetched = Date.parse(fetchedAt);
  if (Number.isNaN(fetched)) return false;
  return Date.now() - fetched < TTL_MS;
}

// ─── Shared Nominatim queue ────────────────────────────────────────────
// All Nominatim calls go through `enqueue` so that:
//   1. Concurrent callers cannot exceed 1 req/sec (OSM policy).
//   2. Forward and reverse calls share the same rate budget.
//   3. Cache writes are also serialized — no race on the JSON file.
let queue: Promise<unknown> = Promise.resolve();

// Chain `work` onto the queue and sleep the remainder of the rate-limit window
// after it resolves. Errors don't break the chain — we always continue.
function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const start = Date.now();
    try {
      return await work();
    } finally {
      const elapsed = Date.now() - start;
      const wait = Math.max(0, RATE_LIMIT_MS - elapsed);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  };
  const result = queue.then(run, run);
  // Use the result on the queue too, but swallow errors so the chain survives.
  queue = result.catch(() => undefined);
  return result;
}

// ─── Reverse: (lat, lng) → "City, Region, Country" ────────────────────

// Just the fields we read from the Nominatim response.
interface NominatimReverseResponse {
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    region?: string;
    province?: string;
    state_district?: string;
    country?: string;
    country_code?: string;
  };
}

// Map a raw Nominatim response into our compact GeoLabel.
// Picks the most specific available city-like field first.
function shapeReverse(res: NominatimReverseResponse): GeoLabel {
  const a = res.address ?? {};
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county;
  const region = a.state ?? a.province ?? a.region ?? a.state_district;
  const country = a.country;
  // country_code is lowercase ISO from Nominatim; we keep it uppercase for consistency.
  const countryCode = a.country_code?.toUpperCase();
  return {
    city,
    region,
    country,
    countryCode,
    displayName: res.display_name,
    fetchedAt: new Date().toISOString(),
  };
}

// Direct fetch — used inside enqueue() so rate-limiting still applies.
async function fetchReverse(lat: number, lng: number): Promise<GeoLabel | null> {
  // zoom=10 returns the appropriate level for a city/region label.
  const url = `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&accept-language=en`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) {
      log.warn(`Nominatim reverse ${res.status} for ${lat},${lng}`);
      return null;
    }
    const body = (await res.json()) as NominatimReverseResponse;
    return shapeReverse(body);
  } catch (err) {
    log.warn(
      `Nominatim reverse fetch failed for ${lat},${lng}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export interface ReverseGeocodeResult {
  cache: CacheFile;
  resolved: number;
  cached: number;
  failed: number;
}

// Walk a list of points, reverse-geocode the unseen/stale ones.
// Returns stats so the caller can log how much fresh work was done.
export async function reverseGeocodePoints(
  points: Array<{ lat: number; lng: number }>,
): Promise<ReverseGeocodeResult> {
  const cache = await readCache();
  let resolved = 0;
  let cached = 0;
  let failed = 0;

  // Track which buckets we've already considered this run to avoid repeated work.
  const seen = new Set<string>();
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
    const key = coordKey(point.lat, point.lng);
    if (seen.has(key)) continue;
    seen.add(key);

    const existing = cache.entries[key];
    if (existing && isFresh(existing.fetchedAt)) {
      cached++;
      continue;
    }

    // Enqueue the network + cache write together so the file is consistent.
    const result = await enqueue(async () => {
      const label = await fetchReverse(point.lat, point.lng);
      if (label) {
        cache.entries[key] = label;
        await writeCache(cache);
      }
      return label;
    });
    if (result) resolved++;
    else failed++;
  }

  log.info(`reverse geocoding: ${resolved} new, ${cached} cached, ${failed} failed`);
  return { cache, resolved, cached, failed };
}

// Expose the cache loader so consumers (e.g. the API case-store) can hand
// `lookupGeocode` directly into the aggregator.
export async function loadGeocodeCache(): Promise<CacheFile> {
  return readCache();
}

// Synchronous lookup against an already-loaded cache.
export function lookupGeocode(cache: CacheFile, lat: number, lng: number): GeoLabel | undefined {
  return cache.entries[coordKey(lat, lng)];
}

// ─── Forward: "Rimouski, Quebec" → (lat, lng) ─────────────────────────

// Subset of Nominatim's /search response we use. `class`, `type`, and
// `importance` are needed by the hit-acceptance filter below.
interface NominatimSearchResult {
  lat?: string;
  lon?: string;
  display_name?: string;
  class?: string;
  type?: string;
  addresstype?: string;
  importance?: number;
}

// Place "class" values from Nominatim that we never accept as a case location.
// These are water/natural features that masquerade as a place when the input
// string is something like "South Atlantic" or "Bay of Bengal".
const FORBIDDEN_CLASSES = new Set(["natural", "waterway", "water"]);
// Within class="boundary", reject sub-types that describe maritime boundaries.
const FORBIDDEN_BOUNDARY_TYPES = new Set(["maritime"]);
// Within class="place", reject place types that are bodies of water.
const FORBIDDEN_PLACE_TYPES = new Set(["ocean", "sea", "bay", "strait", "water"]);
// Nominatim importance score floor. Empirically: countries are ~0.7-0.9,
// large cities ~0.5-0.7, smaller towns ~0.3-0.5. Below ~0.2 we get obscure
// matches that are almost always wrong.
const MIN_IMPORTANCE = 0.2;

// Stopwords + compass directions to ignore when checking whether the query
// and the matched place name share any meaningful tokens. Directions are
// removed because they're the most common false-overlap culprit: a query
// like "South Atlantic" trivially shares "south" with "South Caribbean
// Coast, Nicaragua" even though the places have nothing to do with each
// other.
const TOKEN_STOPWORDS = new Set([
  "of",
  "the",
  "and",
  "in",
  "on",
  "at",
  "to",
  "for",
  "north",
  "south",
  "east",
  "west",
  "northern",
  "southern",
  "eastern",
  "western",
  "central",
  "upper",
  "lower",
  "new",
]);

// Tokenize: lowercase, strip non-alphanumerics, drop short tokens + stopwords.
function meaningfulTokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const raw of s.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3) continue;
    if (TOKEN_STOPWORDS.has(raw)) continue;
    out.add(raw);
  }
  return out;
}

// Require at least one meaningful token from the query to appear in the matched
// place's display_name. Guards against "South Atlantic" → "South Caribbean
// Coast, Nicaragua" where the only shared token is a compass direction.
function shareMeaningfulToken(query: string, displayName: string | undefined): boolean {
  if (!displayName) return false;
  const q = meaningfulTokens(query);
  if (q.size === 0) return false;
  const d = meaningfulTokens(displayName);
  for (const t of q) if (d.has(t)) return true;
  return false;
}

// Decide whether a single Nominatim hit is acceptable as a case location.
// Returns either `{ ok: true }` or a reason string for logging.
function isAcceptableHit(
  hit: NominatimSearchResult,
): { ok: true } | { ok: false; reason: string } {
  const cls = hit.class ?? "";
  const type = hit.type ?? "";
  const importance = typeof hit.importance === "number" ? hit.importance : 0;

  if (FORBIDDEN_CLASSES.has(cls)) {
    return { ok: false, reason: `class="${cls}" is a water/natural feature` };
  }
  if (cls === "boundary" && FORBIDDEN_BOUNDARY_TYPES.has(type)) {
    return { ok: false, reason: `class="boundary" type="${type}" is maritime` };
  }
  if (cls === "place" && FORBIDDEN_PLACE_TYPES.has(type)) {
    return { ok: false, reason: `class="place" type="${type}" is a body of water` };
  }
  if (importance > 0 && importance < MIN_IMPORTANCE) {
    return {
      ok: false,
      reason: `importance ${importance.toFixed(3)} below ${MIN_IMPORTANCE}`,
    };
  }
  return { ok: true };
}

// Fetch + shape the top hit. Returns null when Nominatim has no usable match.
// We ask for limit=5 so that the top result being rejected doesn't immediately
// give up — we walk down the list looking for a non-water, non-obscure place.
async function fetchForward(text: string): Promise<GeoCoord | null> {
  const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(text)}&format=jsonv2&limit=5&accept-language=en`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) {
      log.warn(`Nominatim search ${res.status} for ${JSON.stringify(text)}`);
      return null;
    }
    const body = (await res.json()) as NominatimSearchResult[];
    if (!Array.isArray(body) || body.length === 0) return null;

    // Walk the candidate list, picking the first hit that passes every filter.
    // Logging the rejections is intentional — it gives a paper trail when
    // a place legitimately fails to geocode.
    for (const hit of body) {
      if (!hit.lat || !hit.lon) continue;
      const lat = Number.parseFloat(hit.lat);
      const lng = Number.parseFloat(hit.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const verdict = isAcceptableHit(hit);
      if (!verdict.ok) {
        log.warn(
          `forward-geocode: rejecting hit for ${JSON.stringify(text)} (${hit.display_name ?? "no display_name"}): ${verdict.reason}`,
        );
        continue;
      }
      // Token-overlap check: refuse hits whose display_name shares no
      // meaningful word with the query string. This is what catches the
      // "South Atlantic" → "South Caribbean Coast, Nicaragua" failure mode,
      // where Nominatim's match relies on a deprecated regional alias.
      if (!shareMeaningfulToken(text, hit.display_name)) {
        log.warn(
          `forward-geocode: rejecting hit for ${JSON.stringify(text)} (${hit.display_name ?? "no display_name"}): no meaningful token overlap with query`,
        );
        continue;
      }
      return {
        lat,
        lng,
        displayName: hit.display_name,
        fetchedAt: new Date().toISOString(),
      };
    }
    // All candidates were rejected.
    log.warn(`forward-geocode: no acceptable hits for ${JSON.stringify(text)}`);
    return null;
  } catch (err) {
    log.warn(
      `Nominatim search fetch failed for ${JSON.stringify(text)}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// Public forward-geocode entry. Caches results (including the lookup key)
// so the same place-name resolves instantly next time.
export async function forwardGeocode(text: string): Promise<GeoCoord | null> {
  const cache = await readCache();
  if (!cache.forward) cache.forward = {};
  const key = normalizePlace(text);
  if (!key) return null;

  // Reuse cached result while it's fresh.
  const existing = cache.forward[key];
  if (existing && isFresh(existing.fetchedAt)) return existing;

  return enqueue(async () => {
    const result = await fetchForward(text);
    if (result) {
      cache.forward![key] = result;
      await writeCache(cache);
    }
    return result;
  });
}

// Synchronous lookup against an already-loaded cache.
export function lookupForward(cache: CacheFile, text: string): GeoCoord | undefined {
  if (!cache.forward) return undefined;
  return cache.forward[normalizePlace(text)];
}
