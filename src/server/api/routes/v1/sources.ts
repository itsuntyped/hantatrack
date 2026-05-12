import { Router } from "express";
import { SOURCES } from "../../../scraper/sources";
import { getAllCases } from "../../services/case-store";

// GET /api/v1/sources — list of upstream data sources with per-source stats.
// Lets the UI render a "Data sources" panel and lets monitoring spot a source
// that has gone silent (lastReportedAt is far in the past).

// Wire shape returned per source.
interface SourceSummary {
  id: string;
  displayName: string;
  lastReportedAt: string | null;
  casesContributed: number;
}

export function sourcesRouter(): Router {
  const r = Router();
  r.get("/sources", async (_req, res, next) => {
    try {
      const cases = await getAllCases();
      // Build a stats lookup in one pass instead of scanning per source below.
      const stats = new Map<string, { latest: string | null; count: number }>();
      for (const c of cases) {
        const entry = stats.get(c.source) ?? { latest: null, count: 0 };
        entry.count++;
        // Keep the newest sourceVerifiedAt seen for this source.
        if (!entry.latest || c.sourceVerifiedAt > entry.latest) entry.latest = c.sourceVerifiedAt;
        stats.set(c.source, entry);
      }

      // Iterate the static SOURCES registry so the response order is stable
      // and includes sources that haven't contributed any cases yet.
      const data: SourceSummary[] = SOURCES.map((s) => {
        const stat = stats.get(s.id);
        return {
          id: s.id,
          displayName: s.displayName,
          lastReportedAt: stat?.latest ?? null,
          casesContributed: stat?.count ?? 0,
        };
      });
      // Slightly longer cache than /cases — source list changes rarely.
      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });
  return r;
}
