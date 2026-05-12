import { createHash } from "node:crypto";
import { VALID_STATUSES, type Case, type CaseStatus } from "../../shared/case";
import { LOCATION_COORDS } from "./constants";
import { forwardGeocode } from "./reverse-geocoder";

// Parser. Turns the loose, source-specific shape (`RawCaseInput`) into the
// canonical `Case` shape used everywhere downstream.

// Loose input shape. Each source maps its own fields onto a subset of these
// before handing the row to `parseCase`. snake_case here so we can accept
// the field names sources actually use without remapping.
export interface RawCaseInput {
  native_id?: string | number;
  location_name?: string;
  location?: string;
  status?: string;
  date_reported?: string;
  date?: string;
  latitude?: number | string;
  lat?: number | string;
  longitude?: number | string;
  lon?: number | string;
  lng?: number | string;
  virus_strain?: string;
  strain?: string;
  notes?: string;
}

// Deterministic case id.
// Use a stable nativeId when the source provides one (best case), otherwise
// fingerprint the case from its identifying tuple so reruns produce the same id.
export function makeCaseId(
  source: string,
  nativeId: string | undefined,
  locationName: string,
  dateReported: string,
  lat: number,
  lng: number,
): string {
  const seed = nativeId
    ? `${source}#${nativeId}`
    : `${source}|${locationName}|${dateReported}|${lat.toFixed(2)},${lng.toFixed(2)}`;
  return createHash("sha256").update(seed).digest("hex");
}

// Pick the first non-empty string value from a list of candidate keys.
function pickString(input: RawCaseInput, keys: (keyof RawCaseInput)[]): string | undefined {
  for (const k of keys) {
    const v = input[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

// Pick the first numeric value (parsing strings if necessary) from candidates.
function pickNumber(input: RawCaseInput, keys: (keyof RawCaseInput)[]): number | undefined {
  for (const k of keys) {
    const v = input[k];
    if (v === undefined || v === null || v === "") continue;
    const n = typeof v === "number" ? v : Number.parseFloat(String(v));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

// Type guard wired to VALID_STATUSES.
function isValidStatus(value: string): value is CaseStatus {
  return (VALID_STATUSES as readonly string[]).includes(value);
}

// Coerce source status strings to our canonical set.
// Default to "Suspected" when missing — conservative; never assume confirmed.
function normalizeStatus(raw: string | undefined): CaseStatus {
  if (!raw) return "Suspected";
  const s = raw.trim();
  if (isValidStatus(s)) return s;
  // Handle "confirmed" / "CONFIRMED" / "Confirmed " variants without a full normalization step.
  const capitalized = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  if (isValidStatus(capitalized)) return capitalized;
  throw new Error(`status must be one of ${VALID_STATUSES.join(", ")}; got ${JSON.stringify(raw)}`);
}

// Coordinate resolution.
// 1. Use source-provided coords when they exist and look plausible.
// 2. Otherwise scan LOCATION_COORDS for a free-text match.
// 3. Caller (parseCase) falls through to Nominatim forward geocoding when this returns undefined.
export function resolveCoords(
  locationName: string,
  details: string,
  latIn: number | undefined,
  lonIn: number | undefined,
): [number, number] | undefined {
  if (
    typeof latIn === "number" &&
    typeof lonIn === "number" &&
    // Treat (0,0) as a sentinel for "no coords" — it's the middle of the Atlantic.
    !(latIn === 0 && lonIn === 0) &&
    latIn >= -90 &&
    latIn <= 90 &&
    lonIn >= -180 &&
    lonIn <= 180
  ) {
    return [latIn, lonIn];
  }
  const haystack = `${locationName} ${details}`.toUpperCase();
  for (const [key, coords] of Object.entries(LOCATION_COORDS)) {
    if (haystack.includes(key)) return coords;
  }
  return undefined;
}

// Per-source context attached to each parsed case.
export interface ParseContext {
  source: string;
  sourceVerifiedAt: string;
}

// Parse a single raw row into a Case. Throws on any required field missing
// or unresolvable so callers can collect per-row errors.
export async function parseCase(input: RawCaseInput, ctx: ParseContext): Promise<Case> {
  const locationName = pickString(input, ["location_name", "location"]);
  if (!locationName) throw new Error("Missing required field: location_name");

  const dateReported = pickString(input, ["date_reported", "date"]);
  if (!dateReported) throw new Error("Missing required field: date_reported");

  let lat = pickNumber(input, ["latitude", "lat"]);
  let lon = pickNumber(input, ["longitude", "lon", "lng"]);
  if (lat === undefined || lon === undefined) {
    // 1. Try the small hardcoded LOCATION_COORDS table (instant, no network).
    const resolved = resolveCoords(locationName, input.notes ?? "", lat, lon);
    if (resolved) {
      [lat, lon] = resolved;
    } else {
      // 2. Fall through to Nominatim forward geocoding — cached, rate-limited,
      //    authoritative. Returns null if Nominatim doesn't know the place.
      const geo = await forwardGeocode(locationName);
      if (!geo) {
        throw new Error(`Could not resolve coordinates for location: ${locationName}`);
      }
      lat = geo.lat;
      lon = geo.lng;
    }
  }

  const status = normalizeStatus(pickString(input, ["status"]));
  const virusStrain = pickString(input, ["virus_strain", "strain"]) ?? "Unknown";
  const notes = (input.notes ?? "").trim();
  // Stringify nativeId because some sources emit it as a number.
  const nativeId =
    input.native_id !== undefined && input.native_id !== null
      ? String(input.native_id)
      : undefined;

  return {
    caseId: makeCaseId(ctx.source, nativeId, locationName, dateReported, lat, lon),
    nativeId,
    status,
    dateReported,
    source: ctx.source,
    latitude: lat,
    longitude: lon,
    locationName,
    virusStrain,
    sourceVerifiedAt: ctx.sourceVerifiedAt,
    notes,
  };
}

// Batch parser. Collects per-row errors so one bad row doesn't drop the rest.
export async function parseCases(
  rows: RawCaseInput[],
  ctx: ParseContext,
): Promise<{ cases: Case[]; errors: string[] }> {
  const cases: Case[] = [];
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      cases.push(await parseCase(rows[i]!, ctx));
    } catch (err) {
      // Tag the error with its row index so logs are actionable.
      errors.push(`Row ${i}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { cases, errors };
}
