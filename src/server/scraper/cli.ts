import { createLogger } from "./logger";
import { runScrape } from "./index";

// One-shot scraper CLI entry. Invoked by `npm run scraper`.
// For continuous operation, use `npm run scraper:worker` (worker.ts), which
// runs this same logic on a timer.

const log = createLogger("scraper.cli");

runScrape()
  .then((result) => {
    log.info(
      `Done. total=${result.total} newValid=${result.newValid} invalid=${result.invalid} duration=${result.durationMs}ms output=${result.outputPath}`,
    );
  })
  .catch((err) => {
    log.error("Scrape failed", err instanceof Error ? err : new Error(String(err)));
    // Non-zero exit so CI / orchestrators see the failure.
    process.exit(1);
  });
