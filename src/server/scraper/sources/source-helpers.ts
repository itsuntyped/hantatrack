import type { Case } from "../../../shared/case";
import { parseCase, parseCases, type RawCaseInput } from "../parser";
import { createLogger } from "../logger";

// Shared scaffolding used by every source module.
// Each source implements `SourceModule` and uses `buildSeedCases`/`parseOne`
// to turn its raw rows into canonical `Case` records.

// Result shape returned from a single source.collect() call.
// `verifiedAt` carries the wall-clock time so we can show "as of …" in the UI.
export interface CollectResult {
  cases: Case[];
  verifiedAt: string;
}

// Contract every source file exports.
// Keep this tiny so adding a new source is easy: implement `collect()`.
export interface SourceModule {
  id: string;
  displayName: string;
  collect(): Promise<CollectResult>;
}

// Wall-clock ISO timestamp helper. Centralized so every source agrees on format.
export function nowIso(): string {
  return new Date().toISOString();
}

// Parse a batch of raw rows into Cases, logging per-row failures.
// Used by the seed-fallback path in HTML-scraped sources.
export async function buildSeedCases(
  rows: RawCaseInput[],
  source: string,
  sourceVerifiedAt: string,
  log = createLogger(`scraper.${source.toLowerCase()}`),
): Promise<Case[]> {
  const { cases, errors } = await parseCases(rows, { source, sourceVerifiedAt });
  for (const e of errors) log.warn(`seed parse error: ${e}`);
  return cases;
}

// One-shot variant for sources that parse row-by-row (e.g. ArcGIS pagination).
export function parseOne(row: RawCaseInput, source: string, sourceVerifiedAt: string): Promise<Case> {
  return parseCase(row, { source, sourceVerifiedAt });
}
