import { z } from "zod";
import { VALID_STATUSES, type Case } from "../../shared/case";

// Runtime validator for normalized Case records.
// Sources can produce surprising data — validate before merging into the store.

// Mirrors the Case interface; constraints chosen to catch the failure modes
// we've actually seen (e.g. 0,0 coordinates, empty strings).
const caseSchema = z.object({
  caseId: z.string().min(1),
  status: z.enum(VALID_STATUSES),
  dateReported: z.string().min(1),
  source: z.string().min(1),
  // Coordinates must be plausible — anything outside these bounds is a bug.
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  locationName: z.string().min(1),
  // Default to "Unknown" elsewhere — never accept empty here.
  virusStrain: z.string().min(1),
  sourceVerifiedAt: z.string().min(1),
  // Notes may be empty (most sources don't include extra context).
  notes: z.string(),
});

// Returns an array of human-readable issue strings; empty array means valid.
// We don't throw because callers want to log each issue per case.
export function validateCase(c: Case): string[] {
  const result = caseSchema.safeParse(c);
  if (result.success) return [];
  return result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}
