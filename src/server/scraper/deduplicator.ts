import type { Case } from "../../shared/case";
import { STATUS_WEIGHTS } from "./constants";

// Deduplication strategy.
// Sources frequently report the same case, sometimes with conflicting status
// or freshness. We pick a deterministic winner per dedup key.

// Composite dedup key.
// Prefer nativeId (source-stable), fall back to a fingerprint of place/date/coords
// when the source doesn't give us a stable id. Coords are bucketed to 2 decimal
// places (~1km) so tiny rounding differences don't break the key.
function compositeKey(c: Case): string {
  if (c.nativeId) return `${c.source}#${c.nativeId}`;
  return `${c.source}|${c.locationName}|${c.dateReported}|${c.latitude.toFixed(2)},${c.longitude.toFixed(2)}`;
}

// Tie-breaker between two records that share a dedup key.
// Freshest sourceVerifiedAt wins; on a tie, prefer the higher-severity status.
function shouldReplace(candidate: Case, current: Case): boolean {
  const cand = candidate.sourceVerifiedAt ?? "";
  const curr = current.sourceVerifiedAt ?? "";
  if (cand > curr) return true;
  if (cand < curr) return false;
  // Same verified timestamp — use the STATUS_WEIGHTS table to break the tie.
  return (STATUS_WEIGHTS[candidate.status] ?? 0) > (STATUS_WEIGHTS[current.status] ?? 0);
}

// Collapse duplicate records into a single canonical entry per key.
// O(n) — single pass, Map-keyed.
export function deduplicate(cases: Case[]): Case[] {
  const seen = new Map<string, number>();
  const result: Case[] = [];
  for (const c of cases) {
    const key = compositeKey(c);
    const idx = seen.get(key);
    if (idx === undefined) {
      // First time we see this key — record its position and accept.
      seen.set(key, result.length);
      result.push(c);
    } else if (shouldReplace(c, result[idx]!)) {
      // Existing record loses the tie-break — overwrite in place.
      result[idx] = c;
    }
  }
  return result;
}

// Convenience helper used by the scraper pipeline. Concatenates new + existing
// and dedups in a single pass.
export function mergeWithExisting(newCases: Case[], existing: Case[]): Case[] {
  return deduplicate([...existing, ...newCases]);
}
