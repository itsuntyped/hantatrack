import { Router } from "express";
import { z } from "zod";
import { getAllCases } from "../../services/case-store";
import { HttpError } from "../../middleware/error";
import type { Case } from "../../../../shared/case";
import { VALID_STATUSES } from "../../../../shared/case";

// GET /api/v1/cases — paginated list of individual cases with optional filters.
// Internal-only, read-only — same-origin CORS via siteCors() on /api/v1.

// Query parameter schema. Filters are optional; pagination has safe defaults.
// `since`/`until` enforce YYYY-MM-DD to keep date string comparisons stable.
const querySchema = z.object({
  status: z.enum(VALID_STATUSES).optional(),
  source: z.string().min(1).max(64).optional(),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Cap at 500 per page so a single request can't drag the whole dataset.
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// In-memory filtering. The case-store keeps the full set in memory so this is
// fast for the current dataset size; if we ever outgrow that, push the filter
// down into the store.
function applyFilter(cases: Case[], q: z.infer<typeof querySchema>): Case[] {
  return cases.filter((c) => {
    if (q.status && c.status !== q.status) return false;
    if (q.source && c.source !== q.source) return false;
    // String comparison works because dateReported is ISO-8601 (lexicographic == chronological).
    if (q.since && c.dateReported < q.since) return false;
    if (q.until && c.dateReported > q.until) return false;
    return true;
  });
}

export function casesRouter(): Router {
  const r = Router();
  r.get("/cases", async (req, res, next) => {
    try {
      // Validate query params; surface the first issue message in the error.
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new HttpError(400, "invalid_query", parsed.error.issues[0]?.message ?? "Invalid query");
      }
      const all = await getAllCases();
      const filtered = applyFilter(all, parsed.data);
      // Slice after filtering so `total` reflects matches, not the raw set.
      const window = filtered.slice(parsed.data.offset, parsed.data.offset + parsed.data.limit);
      // Short browser cache + longer SWR so the API stays snappy without going stale.
      res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
      res.json({
        data: window,
        meta: {
          total: filtered.length,
          limit: parsed.data.limit,
          offset: parsed.data.offset,
        },
      });
    } catch (err) {
      next(err);
    }
  });
  return r;
}
