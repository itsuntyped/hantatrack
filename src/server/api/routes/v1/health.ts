import { Router } from "express";

// Liveness probe.
// Cheap unauthenticated endpoint used by load balancers and uptime monitors.
// Intentionally returns immediately without touching the data layer so a
// stalled scraper doesn't mark the server unhealthy.
export function healthRouter(): Router {
  const r = Router();
  r.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  return r;
}
