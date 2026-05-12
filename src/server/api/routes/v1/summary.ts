import { Router } from "express";
import { z } from "zod";
import {
  getCountryAggregates,
  getLocationAggregates,
  getMetadata,
} from "../../services/case-store";
import { HttpError } from "../../middleware/error";

// GET /api/v1/summary — aggregated counts grouped by country or location.
// This is the primary feed for the map UI; SSR also uses it for first paint.

// Query parameter schema. `country` is the default because the map starts
// zoomed out where country-level aggregates are most useful.
const querySchema = z.object({
  groupBy: z.enum(["country", "location"]).default("country"),
});

export function summaryRouter(): Router {
  const r = Router();
  r.get("/summary", async (req, res, next) => {
    try {
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new HttpError(400, "invalid_query", parsed.error.issues[0]?.message ?? "Invalid query");
      }
      // Always include the freshness metadata so clients can show "Updated …".
      const meta = await getMetadata();
      const data =
        parsed.data.groupBy === "location"
          ? await getLocationAggregates()
          : await getCountryAggregates();
      // Same cache profile as /cases — clients expect fresh-enough numbers.
      res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
      res.json({
        groupBy: parsed.data.groupBy,
        data,
        meta,
      });
    } catch (err) {
      next(err);
    }
  });
  return r;
}
