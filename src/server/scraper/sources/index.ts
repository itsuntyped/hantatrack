import { arcgis } from "./arcgis";
import { who } from "./who";
import { ecdc } from "./ecdc";
import { cdc } from "./cdc";
import { healthmap } from "./healthmap";
import type { SourceModule } from "./source-helpers";

// Static registry of every data source the scraper pulls from.
// Order is the order they appear in /api/v1/sources. ArcGIS comes first
// because it's the only live structured feed — the rest are seeded + AI extracted.
export const SOURCES: SourceModule[] = [arcgis, who, ecdc, cdc, healthmap];
