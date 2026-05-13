import { createLogger } from "../logger";
import type { AiExtractedCase } from "./extract-cases";

// AI hallucination guardrails.
// LangChain's structured-output mode guarantees the *shape* of the model
// response — it does not guarantee the *content*. The model can (and has)
// emitted well-formed rows for cases that were never described in the source
// text. The filters below reject the patterns we've seen so a hallucinated
// row never reaches the parser or the forward geocoder.
//
// Each filter is intentionally narrow: it captures a specific class of
// hallucination signal (vague location, missing citation, etc.) so a false
// positive is rare and explainable.

const log = createLogger("scraper.ai.plausibility");

// Substring matches over the lowercased `location_name`. These are water
// features that the model has been observed to emit as a "place". We allow
// them only when the name is qualified with a comma (e.g. "Atlantic City,
// USA") or when the source itself stated explicit coordinates.
const WATER_TERMS = [
  "atlantic",
  "pacific",
  "arctic",
  "antarctic",
  "antarctica",
  "mediterranean",
  "caribbean",
  "baltic",
  "ocean",
  "sea",
  "gulf",
  "bay",
  "strait",
  "channel",
  "lake",
];

// Continent / mega-region words that are not specific enough to geocode.
const CONTINENT_TERMS = [
  "africa",
  "asia",
  "europe",
  "oceania",
  "north america",
  "south america",
  "central america",
  "latin america",
  "middle east",
];

// Generic placeholders the model sometimes invents when it has no real place.
const GENERIC_TERMS = [
  "unknown",
  "n/a",
  "na",
  "various",
  "multiple",
  "global",
  "worldwide",
  "international",
  "tbd",
  "none",
];

// Minimum length for the `notes` field. The AI prompt requires `notes` to
// include a citation (bulletin id, headline, etc.). A notes field that is
// empty, equal to the source name, or otherwise sub-threshold is the single
// strongest signal of a hallucinated row we've observed in production.
const MIN_NOTES_LENGTH = 15;

// One reason a candidate row failed plausibility, used purely for logging.
export interface PlausibilityIssue {
  field: "location_name" | "notes" | "status" | "shape";
  message: string;
}

// Check a single AI-extracted case against every rule. Returns the issues
// found; an empty array means the row is plausible enough to keep.
export function inspectAiCase(c: AiExtractedCase, sourceId: string): PlausibilityIssue[] {
  const issues: PlausibilityIssue[] = [];

  // Location name plausibility.
  const name = (c.location_name ?? "").trim();
  const lower = name.toLowerCase();
  if (name.length < 2) {
    issues.push({ field: "location_name", message: "empty or too short" });
  } else if (GENERIC_TERMS.includes(lower)) {
    issues.push({ field: "location_name", message: `generic placeholder ("${name}")` });
  } else if (CONTINENT_TERMS.includes(lower)) {
    issues.push({
      field: "location_name",
      message: `continent-level, not country/city ("${name}")`,
    });
  } else {
    // Water feature without a city/country anchor and without source-stated coords.
    const hasWater = WATER_TERMS.some(
      (t) =>
        lower === t ||
        lower.startsWith(`${t} `) ||
        lower.endsWith(` ${t}`) ||
        lower.includes(` ${t} `),
    );
    const sourceCoordsProvided =
      typeof c.latitude === "number" && typeof c.longitude === "number";
    if (hasWater && !name.includes(",") && !sourceCoordsProvided) {
      issues.push({
        field: "location_name",
        message: `body of water without country/city anchor ("${name}")`,
      });
    }
  }

  // Notes citation quality. Required by the prompt; an empty / sourceId-only
  // notes field is treated as "model produced filler".
  const notes = (c.notes ?? "").trim();
  if (notes.length === 0) {
    issues.push({ field: "notes", message: "missing — prompt requires source citation" });
  } else if (notes.toLowerCase() === sourceId.toLowerCase()) {
    issues.push({
      field: "notes",
      message: `is just the source name ("${notes}") — no citation`,
    });
  } else if (notes.length < MIN_NOTES_LENGTH) {
    issues.push({
      field: "notes",
      message: `too short (${notes.length} chars) — likely uncited`,
    });
  }

  return issues;
}

// Filter an entire AI batch. Logs every rejection with the failed rules so
// scraper runs are auditable. Returns only the rows that passed every check.
export function filterAiCases<T extends AiExtractedCase>(rows: T[], sourceId: string): T[] {
  const accepted: T[] = [];
  let rejected = 0;
  for (const row of rows) {
    const issues = inspectAiCase(row, sourceId);
    if (issues.length === 0) {
      accepted.push(row);
    } else {
      rejected++;
      log.warn(
        `[${sourceId}] rejected AI row "${row.location_name}" (${row.status} ${row.date_reported}): ${issues
          .map((i) => `${i.field}: ${i.message}`)
          .join("; ")}`,
      );
    }
  }
  if (rejected > 0) {
    log.info(`[${sourceId}] plausibility: ${accepted.length} kept, ${rejected} rejected`);
  }
  return accepted;
}
