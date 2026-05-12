import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Case, SourceRunStats } from "../../shared/case";

// GeoJSON (de)serialization for the case dataset.
// We persist as GeoJSON so the file is directly consumable by GIS tools and
// by browsers via mapping libraries — same format readable in QGIS,
// Mapbox, or our own API.

// One Point feature per case. Properties use snake_case to match the
// GeoJSON convention used by Mapbox/Leaflet/QGIS.
export interface GeoJsonFeature {
  type: "Feature";
  // GeoJSON uses [lng, lat] order — note the swap relative to most other APIs.
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

// Top-level collection. Our `metadata` block is non-standard but valid
// because GeoJSON tolerates foreign members.
export interface GeoJsonCollection {
  type: "FeatureCollection";
  metadata: {
    generated_at: string;
    source_stats: Record<string, SourceRunStats>;
  };
  features: GeoJsonFeature[];
}

// Project a Case into the wire shape.
function caseToFeature(c: Case): GeoJsonFeature {
  return {
    type: "Feature",
    // Watch the order — [lng, lat] is the GeoJSON spec.
    geometry: { type: "Point", coordinates: [c.longitude, c.latitude] },
    properties: {
      case_id: c.caseId,
      // Only include native_id when we have one — keeps the JSON smaller and
      // distinguishes "no id from upstream" from "empty id".
      ...(c.nativeId ? { native_id: c.nativeId } : {}),
      status: c.status,
      date_reported: c.dateReported,
      source: c.source,
      latitude: c.latitude,
      longitude: c.longitude,
      location_name: c.locationName,
      virus_strain: c.virusStrain,
      source_verified_at: c.sourceVerifiedAt,
      notes: c.notes,
    },
  };
}

// Build the full collection. Pure — no IO — so it's easy to test.
export function serializeCases(
  cases: Case[],
  sourceStats: Record<string, SourceRunStats>,
): GeoJsonCollection {
  return {
    type: "FeatureCollection",
    metadata: {
      generated_at: new Date().toISOString(),
      source_stats: sourceStats,
    },
    features: cases.map(caseToFeature),
  };
}

// Atomic-enough write: mkdir then writeFile. Trailing newline so the file
// plays nicely with command-line tools and git.
export async function writeGeoJson(
  cases: Case[],
  sourceStats: Record<string, SourceRunStats>,
  path: string,
): Promise<void> {
  const payload = serializeCases(cases, sourceStats);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

// Convenience wrapper used by the scrape orchestrator — returns only the
// cases array since callers there don't care about the generatedAt timestamp.
export async function readExistingCases(path: string): Promise<Case[]> {
  const { cases } = await readGeoJsonFile(path);
  return cases;
}

// Read + parse the on-disk file. Missing file returns an empty result rather
// than throwing so first-time-run paths "just work".
export async function readGeoJsonFile(
  path: string,
): Promise<{ cases: Case[]; generatedAt: string | null }> {
  try {
    const raw = await readFile(path, "utf8");
    const data = JSON.parse(raw) as GeoJsonCollection;
    // Project the wire shape back into the canonical Case shape.
    const cases = data.features.map((f) => ({
      caseId: f.properties.case_id,
      ...(f.properties.native_id ? { nativeId: f.properties.native_id } : {}),
      status: f.properties.status as Case["status"],
      dateReported: f.properties.date_reported,
      source: f.properties.source,
      latitude: f.properties.latitude,
      longitude: f.properties.longitude,
      locationName: f.properties.location_name,
      virusStrain: f.properties.virus_strain,
      sourceVerifiedAt: f.properties.source_verified_at,
      // Notes may be absent in older files — coalesce to empty string.
      notes: f.properties.notes ?? "",
    }));
    return { cases, generatedAt: data.metadata?.generated_at ?? null };
  } catch (err) {
    // ENOENT means the file doesn't exist yet — empty result, not an error.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { cases: [], generatedAt: null };
    }
    throw err;
  }
}
