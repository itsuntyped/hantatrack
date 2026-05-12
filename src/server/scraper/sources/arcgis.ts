import { fetchJson } from "../http-client";
import { createLogger } from "../logger";
import { nowIso, parseOne, type CollectResult, type SourceModule } from "./source-helpers";
import type { Case } from "../../../shared/case";
import type { RawCaseInput } from "../parser";

// ArcGIS source — University of Toledo's ANDV Hantavirus 2026 Dashboard.
// Unlike the other sources this is a structured FeatureServer, so we parse
// rows directly without AI. The biggest job is pagination + field normalization.

const log = createLogger("scraper.arcgis");
const ID = "ANDV_Dashboard";

// ArcGIS REST page size. Server caps results; we follow exceededTransferLimit.
const PAGE_SIZE = 500;
// FeatureServer query endpoint. Layer index 1 holds the case-level rows.
const SERVICE_URL =
  "https://services1.arcgis.com/wb4Og4gH5mvzQAIV/arcgis/rest/services/Tracking_Hantavirus_2026/FeatureServer/1/query";

// Map the dashboard's status vocabulary onto ours.
// Unknown statuses degrade to "Monitoring" — conservative; never assume confirmed.
const STATUS_MAP: Record<string, string> = {
  CONFIRMED: "Confirmed",
  SUSPECTED: "Suspected",
  PROBABLE: "Probable",
  DECEASED: "Deceased",
  MONITORING: "Monitoring",
  UNKNOWN: "Monitoring",
};

// Minimal shape of an ArcGIS GeoJSON feature — only the fields we read.
interface ArcGisFeature {
  geometry?: { coordinates?: [number, number] } | null;
  properties?: Record<string, unknown>;
}
// Top-level response shape; exceededTransferLimit drives pagination.
interface ArcGisResponse {
  features?: ArcGisFeature[];
  properties?: { exceededTransferLimit?: boolean };
}

// Build the paged query URL.
// `where: 1=1` returns everything; ordering by CASE_ keeps pagination stable.
function pageUrl(offset: number): string {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "*",
    f: "geojson",
    returnGeometry: "true",
    orderByFields: "CASE_ ASC",
    resultRecordCount: String(PAGE_SIZE),
    resultOffset: String(offset),
  });
  return `${SERVICE_URL}?${params.toString()}`;
}

// ArcGIS encodes dates as epoch ms — convert to YYYY-MM-DD strings.
function epochMsToDate(ms: unknown): string | undefined {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return undefined;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

// Safe accessor — returns "" instead of throwing on missing/wrong-type fields.
function readString(props: Record<string, unknown>, key: string): string {
  const v = props[key];
  return typeof v === "string" ? v : "";
}

// Compose the case `notes` field by stitching together optional dashboard fields.
function buildNotes(props: Record<string, unknown>): string {
  const parts: string[] = [];
  const details = readString(props, "DETAILS");
  if (details) parts.push(details);
  const group = readString(props, "Exposure_Group");
  if (group) parts.push(`Exposure group: ${group}.`);
  const sourceUrl = readString(props, "SOURCE");
  if (sourceUrl) parts.push(`Citation: ${sourceUrl}`);
  return parts.join(" ").trim();
}

// Uppercase + trim before STATUS_MAP lookup so case differences don't matter.
function normalizeStatus(raw: string): string {
  const key = raw.toUpperCase().trim();
  return STATUS_MAP[key] ?? "Monitoring";
}

// Prefer ONSET, then DEATH, then fall back to the current verification date.
// Always returns a YYYY-MM-DD string.
function caseDate(props: Record<string, unknown>, fallback: string): string {
  return (
    epochMsToDate(props["ONSET"]) ??
    epochMsToDate(props["DEATH"]) ??
    fallback.slice(0, 10)
  );
}

// Walk all pages until the server stops telling us there's more.
// 10k feature ceiling is a safety net against infinite pagination bugs.
async function fetchAllPages(verifiedAt: string): Promise<ArcGisFeature[]> {
  const all: ArcGisFeature[] = [];
  let offset = 0;
  for (;;) {
    const data = await fetchJson<ArcGisResponse>(pageUrl(offset), { sourceName: ID });
    const features = data.features ?? [];
    all.push(...features);
    if (!data.properties?.exceededTransferLimit || features.length === 0) break;
    offset += features.length;
    if (offset > 10_000) {
      log.warn("aborting pagination after 10,000 features");
      break;
    }
  }
  log.debug(`fetched ${all.length} features at ${verifiedAt}`);
  return all;
}

export const arcgis: SourceModule = {
  id: ID,
  displayName: "ANDV Hantavirus 2026 Dashboard",
  async collect(): Promise<CollectResult> {
    const verifiedAt = nowIso();
    try {
      const features = await fetchAllPages(verifiedAt);
      if (features.length === 0) {
        log.info("ArcGIS returned no features");
        return { cases: [], verifiedAt };
      }

      const cases: Case[] = [];
      for (const feat of features) {
        const props = feat.properties ?? {};
        const location = readString(props, "LASTLOCATION");
        // Skip rows without a usable location string — can't be parsed.
        if (!location) continue;
        // GeoJSON coordinates are [lng, lat] — extract carefully.
        const coords = feat.geometry?.coordinates;
        const caseNumber = props["CASE_"];
        const objectId = props["OBJECTID"];
        // Prefer the dashboard's case number; fall back to OBJECTID so we
        // always have a stable nativeId for the deduplicator.
        const nativeId =
          (typeof caseNumber === "number" || typeof caseNumber === "string") && caseNumber !== ""
            ? String(caseNumber)
            : typeof objectId === "number" || typeof objectId === "string"
              ? String(objectId)
              : undefined;
        const row: RawCaseInput = {
          native_id: nativeId,
          location_name: location,
          status: normalizeStatus(readString(props, "STATUS")),
          date_reported: caseDate(props, verifiedAt),
          latitude: coords?.[1],
          longitude: coords?.[0],
          virus_strain: "Andes",
          notes: buildNotes(props),
        };
        try {
          cases.push(await parseOne(row, ID, verifiedAt));
        } catch (err) {
          // One bad row shouldn't kill the entire ArcGIS run.
          log.warn(
            `parse failed for ${location}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      log.info(`collected ${cases.length} live cases from ArcGIS`);
      return { cases, verifiedAt };
    } catch (err) {
      // ArcGIS down? Emit no cases rather than fail the whole scrape.
      log.warn(
        `ArcGIS unavailable; emitting no cases: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { cases: [], verifiedAt };
    }
  },
};
