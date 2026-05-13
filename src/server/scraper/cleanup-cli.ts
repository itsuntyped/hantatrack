import { createLogger } from "./logger";
import { runCleanup } from "./cleanup";

// CLI entry for the one-shot cleanup. Invoked by `npm run scraper:cleanup`.
// Pass `--dry-run` to see what would change without writing anything.

const log = createLogger("scraper.cleanup.cli");

const dryRun = process.argv.includes("--dry-run");

runCleanup({ dryRun })
  .then((result) => {
    log.info(
      `Done${result.dryRun ? " (dry-run)" : ""}. ` +
        `total=${result.totalBefore} kept=${result.kept} dropped=${result.dropped} ` +
        `forward_cache_dropped=${result.forwardEntriesDropped} ` +
        `reverse_cache_dropped=${result.reverseEntriesDropped}`,
    );
    // Surface a non-zero exit only if there's nothing else to say — useful
    // for CI gates that want "cleanup found bad rows" to fail visibly when
    // the user opts in via an env flag.
    if (result.dropped > 0 && process.env.CLEANUP_FAIL_ON_DROP === "1") {
      process.exit(2);
    }
  })
  .catch((err) => {
    log.error("Cleanup failed", err instanceof Error ? err : new Error(String(err)));
    process.exit(1);
  });
