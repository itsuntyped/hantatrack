import { createHash } from "node:crypto";
import type { Case } from "../../shared/case";
import type {
  AggregateSource,
  CountryCaseAggregate,
  LocationAggregate,
} from "../../shared/case-aggregate";
import type { GeoLabel } from "./reverse-geocoder";

// Aggregator. Turns a flat list of Case records into:
//   - country-level rollups (one row per ISO country)
//   - location-level rollups (one row per unique lat/lng bucket)
// Both rollups are produced from the same Case list so they're guaranteed
// to agree on totals.

// Country recognition is pattern-based: substring matches inside locationName +
// notes (case-insensitive). Patterns include common abbreviations and major
// cities so we still catch a record like "Buenos Aires" without an ISO code.
interface CountryHint {
  code: string;
  name: string;
  patterns: string[];
}

// Order matters when patterns overlap — e.g. "georgia, usa" must match US before
// a bare "georgia" pattern would match the country Georgia. Most-specific first.
const COUNTRY_HINTS: CountryHint[] = [
  { code: "AR", name: "Argentina", patterns: ["argentina", "ushuaia", "buenos aires", "patagonia"] },
  { code: "AU", name: "Australia", patterns: ["australia"] },
  { code: "BE", name: "Belgium", patterns: ["belgium"] },
  { code: "BO", name: "Bolivia", patterns: ["bolivia"] },
  { code: "BR", name: "Brazil", patterns: ["brazil"] },
  { code: "CA", name: "Canada", patterns: ["canada", "vancouver", "toronto", "montreal", "ottawa"] },
  { code: "CH", name: "Switzerland", patterns: ["switzerland", "zurich"] },
  { code: "CL", name: "Chile", patterns: ["chile"] },
  { code: "CV", name: "Cabo Verde", patterns: ["cabo verde", "cape verde", "praia"] },
  { code: "DE", name: "Germany", patterns: ["germany"] },
  { code: "EC", name: "Ecuador", patterns: ["ecuador"] },
  { code: "ES", name: "Spain", patterns: ["spain", "tenerife", "canary", "alicante", "catalonia"] },
  { code: "FI", name: "Finland", patterns: ["finland"] },
  { code: "FR", name: "France", patterns: ["france"] },
  { code: "GB", name: "United Kingdom", patterns: ["united kingdom", "uk", "london"] },
  { code: "GR", name: "Greece", patterns: ["greece"] },
  { code: "IE", name: "Ireland", patterns: ["ireland"] },
  { code: "IT", name: "Italy", patterns: ["italy"] },
  { code: "JP", name: "Japan", patterns: ["japan"] },
  { code: "KR", name: "South Korea", patterns: ["south korea", "korea"] },
  { code: "MX", name: "Mexico", patterns: ["mexico"] },
  { code: "NL", name: "Netherlands", patterns: ["netherlands"] },
  { code: "PY", name: "Paraguay", patterns: ["paraguay"] },
  { code: "SE", name: "Sweden", patterns: ["sweden"] },
  { code: "SG", name: "Singapore", patterns: ["singapore"] },
  { code: "SH", name: "Saint Helena", patterns: ["saint helena", "st helena", "tristan da cunha", "ascension"] },
  { code: "TR", name: "Turkey", patterns: ["turkey"] },
  {
    code: "US",
    name: "United States",
    patterns: [
      "united states",
      "usa",
      "u.s.",
      ", usa",
      "nebraska",
      "arizona",
      "california",
      "texas",
      "virginia",
      "new jersey",
      "new york",
      "georgia, usa",
    ],
  },
  { code: "ZA", name: "South Africa", patterns: ["south africa", "johannesburg"] },
];

// First-match wins so the order above is significant.
function resolveCountry(locationName: string, notes: string): CountryHint | undefined {
  const haystack = `${locationName} ${notes}`.toLowerCase();
  for (const hint of COUNTRY_HINTS) {
    if (hint.patterns.some((p) => haystack.includes(p))) return hint;
  }
  return undefined;
}

// Pretty display names for the source codes we emit.
const SOURCE_DISPLAY: Record<string, string> = {
  WHO: "WHO Disease Outbreak News",
  ECDC: "European Centre for Disease Prevention and Control",
  CDC: "U.S. CDC Health Alert Network",
  HealthMap: "HealthMap (Boston Children's Hospital)",
  GDELT: "GDELT 2.0 News Aggregator",
  ANDV_Dashboard: "ANDV Hantavirus 2026 Dashboard",
};

// Canonical landing URLs per source for citation links in the UI.
const SOURCE_URL: Record<string, string> = {
  WHO: "https://www.who.int/emergencies/disease-outbreak-news",
  ECDC: "https://www.ecdc.europa.eu/en/hantavirus-infection",
  CDC: "https://www.cdc.gov/hantavirus/",
  HealthMap: "https://healthmap.org/",
  GDELT: "https://www.gdeltproject.org/",
  ANDV_Dashboard: "https://www.arcgis.com/apps/dashboards/5c68442d2afc42d7ba2696e4cd393729",
};

// Country rollup. Cases that don't match any pattern are silently dropped here
// (they still appear in location aggregates if their coordinates are valid).
export function aggregateByCountry(cases: Case[]): CountryCaseAggregate[] {
  const groups = new Map<string, { hint: CountryHint; cases: Case[] }>();
  for (const c of cases) {
    const hint = resolveCountry(c.locationName, c.notes);
    if (!hint) continue;
    const existing = groups.get(hint.code);
    if (existing) existing.cases.push(c);
    else groups.set(hint.code, { hint, cases: [c] });
  }

  const aggregates: CountryCaseAggregate[] = [];
  for (const { hint, cases: countryCases } of groups.values()) {
    const total = countryCases.length;
    const confirmed = countryCases.filter((c) => c.status === "Confirmed").length;
    const probable = countryCases.filter((c) => c.status === "Probable").length;
    const suspected = countryCases.filter((c) => c.status === "Suspected").length;
    const fatalities = countryCases.filter((c) => c.status === "Deceased").length;
    // Newest dateReported across the group. ISO strings sort lexicographically.
    const lastReportedAt =
      countryCases
        .map((c) => c.dateReported)
        .sort()
        .at(-1) ?? new Date().toISOString();

    // Build source attribution — one entry per distinct contributing source.
    const sources = new Map<string, AggregateSource>();
    for (const c of countryCases) {
      if (sources.has(c.source)) continue;
      sources.set(c.source, {
        id: c.source,
        name: SOURCE_DISPLAY[c.source] ?? c.source,
        url: SOURCE_URL[c.source] ?? "",
        retrievedAt: c.sourceVerifiedAt,
      });
    }

    aggregates.push({
      countryCode: hint.code,
      countryName: hint.name,
      cases: total,
      confirmed,
      probable,
      suspected,
      fatalities,
      lastReportedAt,
      sources: [...sources.values()],
    });
  }

  // Sort by total descending so the API hands the UI most-affected first.
  return aggregates.sort((a, b) => b.cases - a.cases);
}

// Bucket coordinates into ~1km cells. Two cases within the same cell roll up
// together regardless of micro-differences in the source's coordinates.
function locationKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

// Stable opaque id derived from the bucket key — used as the LocationAggregate.id
// and as the React key on the map.
function locationId(key: string): string {
  return createHash("sha1").update(key).digest("hex").slice(0, 16);
}

// When multiple source-provided names share the same bucket, pick the most
// frequent one so the tooltip header isn't dominated by a one-off variant.
function pickRepresentativeName(cases: Case[]): string {
  const counts = new Map<string, number>();
  for (const c of cases) counts.set(c.locationName, (counts.get(c.locationName) ?? 0) + 1);
  let best = cases[0]!.locationName;
  let bestCount = 0;
  for (const [name, n] of counts) {
    if (n > bestCount) {
      bestCount = n;
      best = name;
    }
  }
  return best;
}

// Optional geocode callback so the aggregator stays decoupled from the
// reverse-geocoder module (lets callers inject test doubles, too).
export type GeoLookup = (lat: number, lng: number) => GeoLabel | undefined;

// Compose a friendly "City, Region, Country" from a GeoLabel, with sensible
// dedup when city == region (e.g. city-states).
function bestLocationLabel(geo: GeoLabel | undefined, fallback: string): string {
  if (!geo) return fallback;
  const parts: string[] = [];
  if (geo.city) parts.push(geo.city);
  if (geo.region && geo.region !== geo.city) parts.push(geo.region);
  if (geo.country) parts.push(geo.country);
  return parts.length > 0 ? parts.join(", ") : fallback;
}

// Location rollup. Drops cases with non-finite coordinates — they can't be placed
// on the map anyway.
export function aggregateByLocation(cases: Case[], lookupGeo?: GeoLookup): LocationAggregate[] {
  const groups = new Map<string, Case[]>();
  for (const c of cases) {
    if (!Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) continue;
    const key = locationKey(c.latitude, c.longitude);
    const existing = groups.get(key);
    if (existing) existing.push(c);
    else groups.set(key, [c]);
  }

  const aggregates: LocationAggregate[] = [];
  for (const [key, locationCases] of groups.entries()) {
    const sample = locationCases[0]!;
    const geo = lookupGeo?.(sample.latitude, sample.longitude);

    // Geocoded country wins over pattern-based country. Patterns are kept as a
    // fallback for points the geocoder doesn't have yet, or for source strings
    // like "MV HONDIUS" that aren't a country at all.
    const fallbackCountry = resolveCountry(sample.locationName, sample.notes);
    const countryCode = geo?.countryCode ?? fallbackCountry?.code;
    const countryName = geo?.country ?? fallbackCountry?.name;

    const fallbackLabel = pickRepresentativeName(locationCases);
    const locationName = bestLocationLabel(geo, fallbackLabel);

    // Same source-attribution logic as the country rollup.
    const sources = new Map<string, AggregateSource>();
    for (const c of locationCases) {
      if (sources.has(c.source)) continue;
      sources.set(c.source, {
        id: c.source,
        name: SOURCE_DISPLAY[c.source] ?? c.source,
        url: SOURCE_URL[c.source] ?? "",
        retrievedAt: c.sourceVerifiedAt,
      });
    }
    const lastReportedAt =
      locationCases
        .map((c) => c.dateReported)
        .sort()
        .at(-1) ?? new Date().toISOString();

    aggregates.push({
      id: locationId(key),
      locationName,
      resolvedCity: geo?.city,
      resolvedRegion: geo?.region,
      countryCode,
      countryName,
      // 4 decimal places (~10m) — plenty for map rendering, keeps wire size down.
      lat: Number(sample.latitude.toFixed(4)),
      lng: Number(sample.longitude.toFixed(4)),
      cases: locationCases.length,
      confirmed: locationCases.filter((c) => c.status === "Confirmed").length,
      probable: locationCases.filter((c) => c.status === "Probable").length,
      suspected: locationCases.filter((c) => c.status === "Suspected").length,
      deceased: locationCases.filter((c) => c.status === "Deceased").length,
      monitoring: locationCases.filter((c) => c.status === "Monitoring").length,
      lastReportedAt,
      sources: [...sources.values()],
    });
  }

  // Most-affected first.
  return aggregates.sort((a, b) => b.cases - a.cases);
}
