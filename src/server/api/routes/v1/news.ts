import { Router } from "express";
import { z } from "zod";
import { getNews } from "../../services/news-store";
import { HttpError } from "../../middleware/error";

// GET /api/v1/news — recent hantavirus news articles for the home page ticker.

// Query schema — the only knob is the page size, capped to keep payloads small.
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(60).default(30),
});

export function newsRouter(): Router {
  const r = Router();
  r.get("/news", async (req, res, next) => {
    try {
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new HttpError(400, "invalid_query", parsed.error.issues[0]?.message ?? "Invalid query");
      }
      const all = await getNews();
      // News-store returns articles already sorted by recency.
      const data = all.slice(0, parsed.data.limit);
      // News updates more slowly than case data — longer cache is safe.
      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      res.json({ data, meta: { total: all.length } });
    } catch (err) {
      next(err);
    }
  });
  return r;
}
