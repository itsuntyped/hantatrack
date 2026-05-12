import { Router } from "express";
import { healthRouter } from "./health";
import { summaryRouter } from "./summary";
import { casesRouter } from "./cases";
import { sourcesRouter } from "./sources";
import { newsRouter } from "./news";
import { updatesRouter } from "./updates";

// Versioned API root. Mount-point for everything under /api/v1.
// Add new resources by importing their router and `r.use()`-ing it here.
export function v1Router(): Router {
  const r = Router();
  r.use(healthRouter());
  r.use(summaryRouter());
  r.use(casesRouter());
  r.use(sourcesRouter());
  r.use(newsRouter());
  r.use(updatesRouter());
  return r;
}
